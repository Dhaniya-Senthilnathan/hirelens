/* ==========================================================
   hirelens frontend logic
   Wires the existing UI (index.html) to the FastAPI backend,
   including full authentication and navigation gating.
   ========================================================== */

const API_BASE = (function () {
  if (window.HIRELENS_API_BASE) return window.HIRELENS_API_BASE;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return `${location.protocol}//${location.host}`;
  }
  return "http://127.0.0.1:8000";
})();

const AUTH_KEY = "hirelens_auth";       // { token, user }
const SETTINGS_KEY = "hirelens_settings"; // { theme, notifications, language }

// ---------- state ----------
let currentUser = null;       // populated after /api/auth/me succeeds
let authToken = null;
let pendingNavAfterLogin = null;

let selectedResumeFile = null;
let useSavedResume = false;
let jdMode = "paste";
let jdTextareaOpen = false;
let jdFileText = null;
let lastAnalysis = null;
let lastAnalysisId = null;
let allHistoryItems = [];

const el = (id) => document.getElementById(id);

// ==========================================================
// Auth-aware fetch helper
// ==========================================================
async function apiFetch(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    renderAuthArea();
    showPage("auth");
    setAuthTab("signin");
    el("authNote").classList.add("show");
    el("authNote").textContent = "Your session expired — please log in again.";
  }
  return res;
}

async function safeJson(res) {
  const raw = await res.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { detail: `Unexpected server response (not JSON): ${raw.slice(0, 200)}` };
  }
}

// ==========================================================
// Session persistence
// ==========================================================
function saveSession(token, user) {
  authToken = token;
  currentUser = user;
  localStorage.setItem(AUTH_KEY, JSON.stringify({ token, user }));
}

function clearSession() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem(AUTH_KEY);
}

function loadStoredSession() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// ==========================================================
// Header auth area (profile chip vs login/signup buttons)
// ==========================================================
function renderAuthArea() {
  const authArea = el("authArea");
  if (currentUser) {
    const initials = getInitials(currentUser.name);
    authArea.innerHTML = `
      <div class="profile-chip" id="profileChip">
        <div class="avatar">${escapeHtml(initials)}</div>
        <span class="pname">${escapeHtml(currentUser.name)}</span>
        <span class="caret">▾</span>
      </div>
      <div class="dropdown" id="profileDropdown">
        <div class="dinfo"><div class="n">${escapeHtml(currentUser.name)}</div><div class="e">${escapeHtml(currentUser.email)}</div></div>
        <div class="ditem" id="ddMyProfile">My profile</div>
        <div class="ditem" id="ddSettings">Settings</div>
        <div class="ditem danger" id="ddLogout">Log out</div>
      </div>`;

    el("profileChip").addEventListener("click", (e) => {
      e.stopPropagation();
      el("profileDropdown").classList.toggle("open");
    });
    el("ddMyProfile").addEventListener("click", () => {
      el("profileDropdown").classList.remove("open");
      showPage("dashboard");
      switchDsub("myprofile");
    });
    el("ddSettings").addEventListener("click", () => {
      el("profileDropdown").classList.remove("open");
      showPage("dashboard");
      switchDsub("settings");
    });
    el("ddLogout").addEventListener("click", logout);
  } else {
    authArea.innerHTML = `
      <button class="btn btn-ghost btn-sm" id="loginBtn">Log in</button>
      <button class="btn btn-primary btn-sm" id="signupBtn">Sign up</button>`;
    el("loginBtn").addEventListener("click", () => {
      el("authNote").classList.remove("show");
      setAuthTab("signin");
      showPage("auth");
    });
    el("signupBtn").addEventListener("click", () => {
      el("authNote").classList.remove("show");
      setAuthTab("signup");
      showPage("auth");
    });
  }
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[1][0]).toUpperCase();
}

function logout() {
  clearSession();
  renderAuthArea();
  showPage("home");
}

// ==========================================================
// Navigation (nav bar, footer links, hero CTA) with auth gating
// ==========================================================
document.querySelectorAll(".hnav button, .foot-col a[data-page]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    goToPage(btn.dataset.page);
  });
});

const heroCta = document.querySelector('[data-page="signup-cta"]');
if (heroCta) {
  heroCta.addEventListener("click", () => {
    if (currentUser) {
      goToPage("dashboard");
    } else {
      el("authNote").classList.remove("show");
      setAuthTab("signup");
      showPage("auth");
    }
  });
}

function goToPage(target) {
  if (target === "dashboard" && !currentUser) {
    pendingNavAfterLogin = "dashboard";
    el("authNote").textContent = "Log in to view your dashboard.";
    el("authNote").classList.add("show");
    setAuthTab("signin");
    showPage("auth");
    return;
  }
  showPage(target);
  if (target === "dashboard") {
    populateProfileFields();
    loadRecent();
    updateSavedResumeUi();
  }
}

// ==========================================================
// Auth form submit (login / signup)
// ==========================================================
el("authSubmitBtn").addEventListener("click", async () => {
  const isSignup = el("tabSignup").classList.contains("on");
  const email = el("authEmailInput").value.trim();
  const password = el("authPasswordInput").value;

  clearAuthError();

  if (isSignup) {
    const name = el("authNameInput").value.trim();
    const confirm = el("authConfirmInput").value;
    const agreed = el("authTermsCheckbox").checked;

    if (!name) return showAuthError("Please enter your full name.");
    if (!email) return showAuthError("Please enter your email.");
    if (password.length < 6) return showAuthError("Password must be at least 6 characters.");
    if (password !== confirm) return showAuthError("Passwords do not match.");
    if (!agreed) return showAuthError("Please agree to the terms and privacy policy.");

    try {
      const res = await apiFetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.detail || "Could not create account.");
      onAuthSuccess(data);
    } catch (err) {
      showAuthError(err.message);
    }
  } else {
    if (!email || !password) return showAuthError("Please enter your email and password.");
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.detail || "Login failed.");
      onAuthSuccess(data);
    } catch (err) {
      showAuthError(err.message);
    }
  }
});

function onAuthSuccess(data) {
  saveSession(data.access_token, data.user);
  renderAuthArea();
  el("authNote").classList.remove("show");
  clearAuthError();
  ["authNameInput", "authEmailInput", "authPasswordInput", "authConfirmInput"].forEach((id) => (el(id).value = ""));
  el("authTermsCheckbox").checked = false;

  const target = pendingNavAfterLogin || "dashboard";
  pendingNavAfterLogin = null;
  showPage(target);
  populateProfileFields();
  loadRecent();
  updateSavedResumeUi();
}

function showAuthError(msg) {
  el("authError").textContent = msg;
  el("authError").style.display = "block";
}
function clearAuthError() {
  el("authError").style.display = "none";
  el("authError").textContent = "";
}

el("googleOauthBtn").addEventListener("click", async () => {
  try {
    const res = await fetch(`${API_BASE}/api/auth/google/status`);
    const data = await safeJson(res);
    if (data.configured) {
      window.location.href = `${API_BASE}/api/auth/google/login`;
    } else {
      showAuthError(
        "Google sign-in isn't configured on this server yet. It needs a Google Cloud OAuth " +
        "client (see README.md → Google Sign-In Setup) — until then, please use email login."
      );
    }
  } catch (e) {
    showAuthError("Couldn't reach the backend to check Google sign-in status. Please use email login.");
  }
});

el("forgotPasswordLink").addEventListener("click", () => showResetPanel());
el("backToSigninLink").addEventListener("click", () => hideResetPanel());

function showResetPanel() {
  el("authNormalPanel").style.display = "none";
  el("authResetPanel").style.display = "block";
  el("resetStep2").style.display = "none";
  el("resetEmailField").style.display = "block";
  el("resetRequestBtn").style.display = "block";
  el("resetEmailInput").value = "";
  el("resetNewPasswordInput").value = "";
  el("resetConfirmPasswordInput").value = "";
  clearResetErrors();
  el("authNote").classList.remove("show");
}

function hideResetPanel() {
  el("authResetPanel").style.display = "none";
  el("authNormalPanel").style.display = "block";
  clearAuthError();
}

function clearResetErrors() {
  el("resetStep1Error").style.display = "none";
  el("resetStep2Error").style.display = "none";
}

let activeResetToken = null;

el("resetRequestBtn").addEventListener("click", async () => {
  clearResetErrors();
  const email = el("resetEmailInput").value.trim();
  if (!email) {
    el("resetStep1Error").textContent = "Please enter your account email.";
    el("resetStep1Error").style.display = "block";
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.detail || "Something went wrong.");

    if (!data.reset_token) {
      // Same response whether or not the email exists, to avoid leaking
      // which emails have accounts — but there's nothing to continue with.
      el("resetStep1Error").textContent =
        "If that email has an account, you can now set a new password below.";
      el("resetStep1Error").style.color = "var(--text2)";
      el("resetStep1Error").style.display = "block";
      return;
    }

    activeResetToken = data.reset_token;
    el("resetEmailField").style.display = "none";
    el("resetRequestBtn").style.display = "none";
    el("resetStep2").style.display = "block";
  } catch (err) {
    el("resetStep1Error").textContent = err.message;
    el("resetStep1Error").style.color = "var(--coral)";
    el("resetStep1Error").style.display = "block";
  }
});

el("resetSubmitBtn").addEventListener("click", async () => {
  clearResetErrors();
  const newPassword = el("resetNewPasswordInput").value;
  const confirmPassword = el("resetConfirmPasswordInput").value;

  if (newPassword.length < 6) {
    el("resetStep2Error").textContent = "Password must be at least 6 characters.";
    el("resetStep2Error").style.display = "block";
    return;
  }
  if (newPassword !== confirmPassword) {
    el("resetStep2Error").textContent = "Passwords do not match.";
    el("resetStep2Error").style.display = "block";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: activeResetToken, new_password: newPassword }),
    });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.detail || "Could not reset password.");

    hideResetPanel();
    setAuthTab("signin");
    el("authNote").textContent = "Password updated — please sign in.";
    el("authNote").classList.add("show");
  } catch (err) {
    el("resetStep2Error").textContent = err.message;
    el("resetStep2Error").style.display = "block";
  }
});

// Google OAuth redirects back to "/#google_token=..." — pick that up on load.
async function handleGoogleRedirectToken() {
  const hash = window.location.hash || "";
  if (hash.startsWith("#google_token=")) {
    const token = decodeURIComponent(hash.replace("#google_token=", ""));
    history.replaceState(null, "", window.location.pathname);
    try {
      authToken = token;
      const res = await apiFetch("/api/auth/me");
      if (res.ok) {
        const user = await safeJson(res);
        saveSession(token, user);
        renderAuthArea();
        showPage("dashboard");
        populateProfileFields();
        loadRecent();
      }
    } catch (e) { /* ignore — user stays logged out */ }
  } else if (hash.startsWith("#auth_error=")) {
    history.replaceState(null, "", window.location.pathname);
    showPage("auth");
    setAuthTab("signin");
    showAuthError("Google sign-in failed. Please try again or use email login.");
  }
}

// ==========================================================
// My Profile — editable rows + default resume
// ==========================================================
const FIELD_LABELS = {
  phone: "Phone number",
  college: "College / university",
  branch_year: "Branch & graduation year",
  linkedin_github: "LinkedIn / GitHub",
  name: "Full name",
};

function populateProfileFields() {
  if (!currentUser) return;
  el("dashWelcome").textContent = `Welcome back, ${currentUser.name}`;

  document.querySelectorAll("#dsub-myprofile .set-row[data-field]").forEach((row) => {
    const field = row.dataset.field;
    const valueEl = row.querySelector("[data-value]");
    if (!valueEl) return;
    const val = currentUser[field];
    if (field === "email") {
      valueEl.textContent = currentUser.email;
    } else {
      valueEl.textContent = val && val.trim() ? val : "Not added";
      const editBtn = row.querySelector("[data-edit]");
      if (editBtn) editBtn.textContent = val && val.trim() ? "Edit" : "Add";
    }
  });

  updateSavedResumeUi();
}

document.querySelectorAll("#dsub-myprofile .set-row[data-field] [data-edit]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const row = btn.closest(".set-row");
    const field = row.dataset.field;
    if (field === "email") return; // not editable
    startInlineEdit(row, field);
  });
});

function startInlineEdit(row, field) {
  const container = row.querySelector("div");
  const valueEl = row.querySelector("[data-value]");
  const currentVal = (currentUser[field] || "").trim();
  const existingInput = row.querySelector("input[data-editing]");
  if (existingInput) return; // already editing

  const input = document.createElement("input");
  input.type = "text";
  input.value = currentVal;
  input.setAttribute("data-editing", "true");
  input.placeholder = FIELD_LABELS[field] || field;
  input.style.cssText =
    "width:100%; margin-top:6px; padding:8px 10px; border-radius:8px; border:.5px solid var(--line2); background:var(--ink); color:var(--text); font-family:var(--f-body); font-size:13px;";

  valueEl.style.display = "none";
  container.appendChild(input);
  input.focus();

  const editBtn = row.querySelector("[data-edit]");
  const originalLabel = editBtn.textContent;
  editBtn.textContent = "Save";

  const finishEdit = async (save) => {
    if (save) {
      const newVal = input.value.trim();
      try {
        const res = await apiFetch("/api/auth/me", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: newVal }),
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.detail || "Could not save.");
        currentUser = data;
        saveSession(authToken, currentUser);
        renderAuthArea();
      } catch (err) {
        alert(err.message);
      }
    }
    input.remove();
    valueEl.style.display = "";
    populateProfileFields();
    editBtn.textContent = originalLabel;
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finishEdit(true);
    if (e.key === "Escape") finishEdit(false);
  });
  editBtn.onclick = () => finishEdit(true);
}

function updateSavedResumeUi() {
  const statusEl = el("defaultResumeStatus");
  const removeBtn = el("removeDefaultResumeBtn");
  const useSavedBtn = el("useSavedResumeBtn");
  if (!currentUser) return;

  if (currentUser.has_default_resume) {
    statusEl.textContent = currentUser.default_resume_filename;
    removeBtn.style.display = "inline-flex";
    useSavedBtn.style.display = "inline-flex";
  } else {
    statusEl.textContent = "None uploaded";
    removeBtn.style.display = "none";
    useSavedBtn.style.display = "none";
  }
}

el("uploadDefaultResumeBtn").addEventListener("click", () => el("defaultResumeInput").click());

el("defaultResumeInput").addEventListener("change", async () => {
  const file = el("defaultResumeInput").files[0];
  if (!file) return;
  if (!/\.(pdf|docx)$/i.test(file.name)) {
    alert("Only PDF or DOCX resumes are supported.");
    return;
  }
  const formData = new FormData();
  formData.append("resume", file);
  try {
    const res = await apiFetch("/api/auth/me/resume", { method: "POST", body: formData });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.detail || "Upload failed.");
    currentUser.has_default_resume = true;
    currentUser.default_resume_filename = data.filename;
    saveSession(authToken, currentUser);
    updateSavedResumeUi();
    flashSaved();
  } catch (err) {
    alert(err.message);
  }
});

el("removeDefaultResumeBtn").addEventListener("click", async () => {
  if (!confirm("Remove your saved resume?")) return;
  try {
    const res = await apiFetch("/api/auth/me/resume", { method: "DELETE" });
    if (!res.ok) throw new Error("Could not remove saved resume.");
    currentUser.has_default_resume = false;
    currentUser.default_resume_filename = null;
    saveSession(authToken, currentUser);
    updateSavedResumeUi();
  } catch (err) {
    alert(err.message);
  }
});

function flashSaved() {
  const note = el("profileSavedNote");
  note.style.display = "block";
  setTimeout(() => (note.style.display = "none"), 2000);
}

// ==========================================================
// Settings — theme, notifications, language (persisted locally)
// ==========================================================
function loadSettings() {
  let settings = { theme: "dark", notifications: true, language: "English" };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) settings = { ...settings, ...JSON.parse(raw) };
  } catch (e) { /* ignore */ }
  return settings;
}
function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applySettings(settings) {
  document.documentElement.dataset.theme = settings.theme === "light" ? "light" : "";
  el("themeToggle").classList.toggle("on", settings.theme !== "light");
  el("notifToggle").classList.toggle("on", !!settings.notifications);
  el("languageSelect").value = settings.language || "English";
}

el("themeToggle").addEventListener("click", () => {
  const settings = loadSettings();
  settings.theme = settings.theme === "light" ? "dark" : "light";
  saveSettings(settings);
  applySettings(settings);
});
el("notifToggle").addEventListener("click", () => {
  const settings = loadSettings();
  settings.notifications = !settings.notifications;
  saveSettings(settings);
  applySettings(settings);
});
el("languageSelect").addEventListener("change", () => {
  const settings = loadSettings();
  settings.language = el("languageSelect").value;
  saveSettings(settings);
});

el("deleteAccountBtn").addEventListener("click", async () => {
  if (!confirm("This permanently deletes your account and all saved reports. Continue?")) return;
  try {
    const res = await apiFetch("/api/auth/me", { method: "DELETE" });
    if (!res.ok) throw new Error("Could not delete account.");
    clearSession();
    renderAuthArea();
    showPage("home");
  } catch (err) {
    alert(err.message);
  }
});

// ==========================================================
// Contact form
// ==========================================================
el("contactSubmitBtn").addEventListener("click", async () => {
  const name = el("contactNameInput").value.trim();
  const email = el("contactEmailInput").value.trim();
  const message = el("contactMessageInput").value.trim();
  const statusEl = el("contactStatus");

  if (!message) {
    statusEl.style.color = "var(--coral)";
    statusEl.textContent = "Please write a message before sending.";
    statusEl.style.display = "block";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, message }),
    });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.detail || "Could not send message.");
    statusEl.style.color = "var(--lime)";
    statusEl.textContent = "Message saved — thanks for reaching out!";
    statusEl.style.display = "block";
    el("contactNameInput").value = "";
    el("contactEmailInput").value = "";
    el("contactMessageInput").value = "";
  } catch (err) {
    statusEl.style.color = "var(--coral)";
    statusEl.textContent = err.message;
    statusEl.style.display = "block";
  }
});

// ==========================================================
// Resume upload (browse + drag & drop) — for a one-off analysis
// ==========================================================
const resumeUpcard = el("resumeUpcard");
const resumeFileInput = el("resumeFileInput");
const resumeFileNameEl = el("resumeFileName");
const resumeHint = el("resumeHint");
const browseResumeBtn = el("browseResumeBtn");
const useSavedResumeBtn = el("useSavedResumeBtn");

browseResumeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  resumeFileInput.click();
});
resumeUpcard.addEventListener("click", (e) => {
  if (e.target === useSavedResumeBtn) return;
  resumeFileInput.click();
});

resumeFileInput.addEventListener("change", () => {
  if (resumeFileInput.files && resumeFileInput.files[0]) {
    setResumeFile(resumeFileInput.files[0]);
  }
});

useSavedResumeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  useSavedResume = true;
  selectedResumeFile = null;
  resumeFileNameEl.textContent = `Using saved resume: ${currentUser.default_resume_filename}`;
  resumeFileNameEl.style.display = "block";
  resumeHint.textContent = "Or drop/browse a different file to use instead.";
  clearError();
});

["dragover", "dragenter"].forEach((evt) =>
  resumeUpcard.addEventListener(evt, (e) => {
    e.preventDefault();
    resumeUpcard.style.borderColor = "var(--lime)";
  })
);
["dragleave", "dragend"].forEach((evt) =>
  resumeUpcard.addEventListener(evt, () => {
    resumeUpcard.style.borderColor = "";
  })
);
resumeUpcard.addEventListener("drop", (e) => {
  e.preventDefault();
  resumeUpcard.style.borderColor = "";
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) setResumeFile(file);
});

function setResumeFile(file) {
  const validExt = /\.(pdf|docx)$/i.test(file.name);
  if (!validExt) {
    showError("Only PDF or DOCX resumes are supported.");
    return;
  }
  clearError();
  useSavedResume = false;
  selectedResumeFile = file;
  resumeFileNameEl.textContent = `Selected: ${file.name}`;
  resumeFileNameEl.style.display = "block";
  resumeHint.textContent = "Looks good. Drop a different file to replace it.";
}

// ==========================================================
// Job description: paste text vs upload file
// ==========================================================
const jdToggle = el("jdToggle");
const jdHint = el("jdHint");
const jdTextarea = el("jdTextarea");
const jdFileInput = el("jdFileInput");
const jdFileNameEl = el("jdFileName");
const jdActionBtn = el("jdActionBtn");
const jobTitleInput = el("jobTitleInput");

jdToggle.querySelectorAll("button[data-jdmode]").forEach((btn) => {
  btn.addEventListener("click", () => setJdMode(btn.dataset.jdmode));
});

function setJdMode(mode) {
  jdMode = mode;
  jdTextareaOpen = false;
  jdTextarea.style.display = "none";
  jobTitleInput.style.display = "none";
  jdFileNameEl.style.display = "none";
  jdFileText = null;

  if (mode === "paste") {
    jdHint.textContent = "Paste the full JD or upload a .txt/.pdf";
    jdActionBtn.textContent = "Open text area";
  } else {
    jdHint.textContent = "Upload a .txt or .pdf file containing the job description";
    jdActionBtn.textContent = "Browse file";
  }
}

jdActionBtn.addEventListener("click", () => {
  if (jdMode === "paste") {
    jdTextareaOpen = !jdTextareaOpen;
    jdTextarea.style.display = jdTextareaOpen ? "block" : "none";
    jobTitleInput.style.display = jdTextareaOpen ? "block" : "none";
    jdActionBtn.textContent = jdTextareaOpen ? "Close text area" : "Open text area";
    if (jdTextareaOpen) jdTextarea.focus();
  } else {
    jdFileInput.click();
  }
});

jdFileInput.addEventListener("change", async () => {
  const file = jdFileInput.files && jdFileInput.files[0];
  if (!file) return;

  const validExt = /\.(pdf|txt)$/i.test(file.name);
  if (!validExt) {
    showError("Job description file must be .txt or .pdf");
    return;
  }

  jdFileNameEl.textContent = `Reading ${file.name}...`;
  jdFileNameEl.style.display = "block";

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await apiFetch("/api/parse-jd-file", { method: "POST", body: formData });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.detail || "Could not read job description file.");
    jdFileText = data.text;
    jdFileNameEl.textContent = `Loaded: ${file.name} (${jdFileText.split(/\s+/).length} words)`;
    jobTitleInput.style.display = "block";
    clearError();
  } catch (err) {
    showError(err.message);
    jdFileNameEl.style.display = "none";
    jdFileText = null;
  }
});

// ==========================================================
// Run analysis
// ==========================================================
const analyzeError = el("analyzeError");
const runAnalysisBtn = el("runAnalysisBtn");

runAnalysisBtn.addEventListener("click", async () => {
  clearError();

  if (!currentUser) {
    goToPage("dashboard");
    return;
  }

  const jdText = jdMode === "paste" ? jdTextarea.value.trim() : (jdFileText || "").trim();

  if (!selectedResumeFile && !useSavedResume) {
    showError("Please upload a resume (PDF or DOCX), or use your saved resume from My Profile.");
    return;
  }
  if (!jdText) {
    showError(
      jdMode === "paste"
        ? "Please paste a job description before running the analysis."
        : "Please upload a job description file before running the analysis."
    );
    return;
  }

  const formData = new FormData();
  if (useSavedResume) {
    formData.append("use_saved_resume", "true");
  } else {
    formData.append("resume", selectedResumeFile);
  }
  formData.append("job_description", jdText);
  formData.append("job_title", jobTitleInput.value.trim());
  formData.append("save", "true");

  setRunning(true);
  try {
    const res = await apiFetch("/api/analyze", { method: "POST", body: formData });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.detail || "Analysis failed. Please try again.");

    lastAnalysis = data;
    lastAnalysisId = data.id || null;
    renderResult(data);
    loadRecent();
    if (document.getElementById("dsub-history").classList.contains("on")) {
      loadHistory();
    }
  } catch (err) {
    showError(err.message);
  } finally {
    setRunning(false);
  }
});

function setRunning(isRunning) {
  runAnalysisBtn.disabled = isRunning;
  runAnalysisBtn.textContent = isRunning ? "Analyzing..." : "Run analysis →";
}

function showError(msg) {
  analyzeError.textContent = msg;
  analyzeError.style.display = "block";
}
function clearError() {
  analyzeError.style.display = "none";
  analyzeError.textContent = "";
}

// ==========================================================
// Render analysis result
// ==========================================================
const resultBlock = el("resultBlock");
const gaugeRing = el("gaugeRing");
const gaugeNum = el("gaugeNum");
const resSummaryTitle = el("resSummaryTitle");
const resSummaryText = el("resSummaryText");
const chipsContainer = el("chipsContainer");
const recommendationsPanel = el("recommendationsPanel");
const recommendationsList = el("recommendationsList");
const exportPdfBtn = el("exportPdfBtn");
const saveReportBtn = el("saveReportBtn");

function renderResult(data) {
  resultBlock.classList.add("show");

  animateGauge(Math.round(data.match_score));

  const matchedCount = data.matched_skills.length;
  const totalRequired = data.required_skills.length;
  const missingCount = data.missing_skills.length;

  let title;
  if (totalRequired === 0) {
    title = "No specific skills detected in the job description";
  } else if (data.match_score >= 75) {
    title = "Strong fit — a few gaps to close";
  } else if (data.match_score >= 45) {
    title = "Moderate fit — worth tailoring your resume";
  } else {
    title = "Weak fit — significant gaps to address";
  }
  resSummaryTitle.textContent = title;
  resSummaryText.textContent =
    totalRequired === 0
      ? "We couldn't detect specific required skills in this job description — try pasting the full listing including the requirements section."
      : `You match ${matchedCount} of ${totalRequired} required skills for this role. ` +
        (missingCount > 0
          ? `Close the ${missingCount} missing one${missingCount === 1 ? "" : "s"} below to strengthen your fit.`
          : `You match every required skill detected — great fit.`);

  chipsContainer.innerHTML = "";
  data.matched_skills.forEach((skill) => chipsContainer.appendChild(makeChip(skill, "matched")));
  data.missing_skills.forEach((skill) => chipsContainer.appendChild(makeChip(skill, "missing")));

  if (data.recommendations && data.recommendations.length > 0) {
    recommendationsPanel.style.display = "block";
    recommendationsList.innerHTML = "";
    data.recommendations.forEach((rec) => {
      const row = document.createElement("div");
      row.className = "rrow";
      row.innerHTML = `
        <div>
          <div class="rt">${escapeHtml(rec.skill)}</div>
          <div class="rd">${escapeHtml(rec.title)}</div>
        </div>
        <a href="${escapeAttr(rec.url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">Open ↗</a>
      `;
      recommendationsList.appendChild(row);
    });
  } else {
    recommendationsPanel.style.display = "none";
  }

  saveReportBtn.textContent = lastAnalysisId ? "Saved ✓" : "Save report";
  resultBlock.scrollIntoView({ behavior: "smooth", block: "start" });
}

function makeChip(text, kind) {
  const span = document.createElement("span");
  span.className = `chip ${kind}`;
  span.textContent = kind === "missing" ? `${text} ↗` : text;
  return span;
}

function animateGauge(target) {
  const circumference = 440;
  let n = 0;
  gaugeNum.textContent = "0%";
  gaugeRing.style.stroke = target >= 60 ? "var(--lime)" : "var(--coral)";
  const iv = setInterval(() => {
    n++;
    gaugeNum.textContent = n + "%";
    gaugeRing.style.strokeDashoffset = circumference - (circumference * n) / 100;
    if (n >= target) clearInterval(iv);
  }, 12);
}

saveReportBtn.addEventListener("click", () => {
  if (!lastAnalysisId) return;
  saveReportBtn.textContent = "Saved ✓";
});

exportPdfBtn.addEventListener("click", async () => {
  if (!lastAnalysisId) {
    showError("Run an analysis first — reports are saved automatically before exporting.");
    return;
  }
  try {
    const res = await apiFetch(`/api/export/${lastAnalysisId}`);
    if (!res.ok) throw new Error("Could not generate the PDF report.");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hirelens_report_${lastAnalysisId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    showError(err.message);
  }
});

// ==========================================================
// Recent analyses (New tab) + History tab
// ==========================================================
const recentList = el("recentList");
const historyTableBody = el("historyTableBody");
const historyCount = el("historyCount");
const historySearch = el("historySearch");

async function loadRecent() {
  if (!currentUser) return;
  try {
    const res = await apiFetch("/api/history");
    if (!res.ok) return;
    const items = await safeJson(res);
    recentList.innerHTML = "";
    if (items.length === 0) {
      recentList.innerHTML = `<div class="rrow"><div><div class="rt">No analyses yet</div><div class="rd">Run your first analysis above</div></div></div>`;
      return;
    }
    items.slice(0, 3).forEach((item) => recentList.appendChild(makeRecentRow(item)));
  } catch (e) { /* backend may not be reachable on load */ }
}

function makeRecentRow(item) {
  const row = document.createElement("div");
  row.className = "rrow";
  const label = item.job_title || item.resume_filename || "Untitled analysis";
  row.innerHTML = `
    <div><div class="rt">${escapeHtml(label)}</div><div class="rd">${escapeHtml(formatDate(item.created_at))}</div></div>
    <span class="pill ${scoreClass(item.match_score)}">${Math.round(item.match_score)}%</span>
  `;
  return row;
}

function scoreClass(score) {
  if (score >= 70) return "hi";
  if (score >= 45) return "mid";
  return "lo";
}

function formatDate(isoLike) {
  if (!isoLike) return "";
  const d = new Date(isoLike.replace(" ", "T"));
  if (isNaN(d.getTime())) return isoLike;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

async function loadHistory() {
  if (!currentUser) return;
  try {
    const res = await apiFetch("/api/history");
    if (!res.ok) return;
    allHistoryItems = await safeJson(res);
    renderHistoryTable(allHistoryItems);
  } catch (e) { /* ignore */ }
}

function renderHistoryTable(items) {
  historyCount.textContent = `${items.length} saved report${items.length === 1 ? "" : "s"}`;
  historyTableBody.innerHTML = "";

  if (items.length === 0) {
    historyTableBody.innerHTML = `<tr><td colspan="4" style="color:var(--text3); font-size:13px;">No saved reports yet.</td></tr>`;
    return;
  }

  items.forEach((item) => {
    const tr = document.createElement("tr");
    const label = item.job_title || item.resume_filename || "Untitled analysis";
    tr.innerHTML = `
      <td>${escapeHtml(label)}</td>
      <td>${escapeHtml(formatDate(item.created_at))}</td>
      <td><span class="pill ${scoreClass(item.match_score)}">${Math.round(item.match_score)}%</span></td>
      <td><div class="row-actions">
        <span class="icon-btn" data-action="view" data-id="${item.id}">↗</span>
        <span class="icon-btn" data-action="delete" data-id="${item.id}">🗑</span>
      </div></td>
    `;
    historyTableBody.appendChild(tr);
  });
}

historyTableBody.addEventListener("click", async (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const id = target.dataset.id;

  if (target.dataset.action === "delete") {
    if (!confirm("Delete this saved report?")) return;
    await apiFetch(`/api/history/${id}`, { method: "DELETE" });
    loadHistory();
    loadRecent();
  } else if (target.dataset.action === "view") {
    try {
      const res = await apiFetch(`/api/history/${id}`);
      const record = await safeJson(res);
      if (!res.ok) throw new Error(record.detail || "Could not load report.");
      lastAnalysisId = record.id;
      renderResult({
        match_score: record.match_score,
        matched_skills: record.matched_skills,
        missing_skills: record.missing_skills,
        required_skills: [...record.matched_skills, ...record.missing_skills],
        recommendations: record.recommendations,
      });
      switchDsub("new");
    } catch (err) {
      alert(err.message);
    }
  }
});

historySearch.addEventListener("input", () => {
  const q = historySearch.value.trim().toLowerCase();
  const filtered = allHistoryItems.filter((item) => {
    const label = (item.job_title || item.resume_filename || "").toLowerCase();
    return label.includes(q);
  });
  renderHistoryTable(filtered);
});

document.querySelectorAll(".dsub button").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.dsub === "history") loadHistory();
  });
});

// ==========================================================
// utils
// ==========================================================
function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str == null ? "" : String(str);
  return d.innerHTML;
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

// ==========================================================
// Boot
// ==========================================================
(async function init() {
  applySettings(loadSettings());

  await handleGoogleRedirectToken();

  const stored = loadStoredSession();
  if (stored && stored.token) {
    authToken = stored.token;
    currentUser = stored.user;
    renderAuthArea(); // optimistic render, verified below

    try {
      const res = await apiFetch("/api/auth/me");
      if (res.ok) {
        currentUser = await safeJson(res);
        saveSession(authToken, currentUser);
      } else {
        clearSession();
      }
    } catch (e) {
      // backend not reachable yet — keep optimistic session
    }
  }

  renderAuthArea();
  if (currentUser) {
    populateProfileFields();
    loadRecent();
  }
})();
