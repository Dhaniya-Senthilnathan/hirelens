const API_BASE = (() => {
  if (location.protocol === 'http:' && location.port === '8000') {
    return `${location.protocol}//${location.host}`;
  }
  return 'http://127.0.0.1:8000';
})();

const AUTH_KEY = 'hirelens_auth';
const SETTINGS_KEY = 'hirelens_settings';

let currentUser = null;
let authToken = null;

const el = (id) => document.getElementById(id);

async function apiFetch(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    renderAuthArea();
    if (window.location.pathname === '/dashboard') {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    }
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

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[1][0]).toUpperCase();
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

function loadSettings() {
  let settings = { theme: 'dark', notifications: true, language: 'English' };
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
  document.documentElement.dataset.theme = settings.theme === 'light' ? 'light' : '';

  const themeToggle = document.getElementById('themeToggle');
  const notifToggle = document.getElementById('notifToggle');
  const languageSelect = document.getElementById('languageSelect');

  if (themeToggle) themeToggle.classList.toggle('on', settings.theme !== 'light');
  if (notifToggle) notifToggle.classList.toggle('on', !!settings.notifications);
  if (languageSelect) languageSelect.value = settings.language || 'English';
}

function renderAuthArea() {
  const authArea = document.getElementById('authArea');
  if (!authArea) return;

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

    const profileChip = document.getElementById('profileChip');
    const profileDropdown = document.getElementById('profileDropdown');
    const ddMyProfile = document.getElementById('ddMyProfile');
    const ddSettings = document.getElementById('ddSettings');
    const ddLogout = document.getElementById('ddLogout');

    if (profileChip) {
      profileChip.addEventListener('click', (e) => {
        e.stopPropagation();
        if (profileDropdown) profileDropdown.classList.toggle('open');
      });
    }
    if (ddMyProfile) {
      ddMyProfile.addEventListener('click', () => {
        if (profileDropdown) profileDropdown.classList.remove('open');
        if (window.location.pathname !== '/dashboard') {
          window.location.href = '/dashboard';
          return;
        }
        if (window.switchDsub) window.switchDsub('myprofile');
      });
    }
    if (ddSettings) {
      ddSettings.addEventListener('click', () => {
        if (profileDropdown) profileDropdown.classList.remove('open');
        if (window.location.pathname !== '/dashboard') {
          window.location.href = '/dashboard';
          return;
        }
        if (window.switchDsub) window.switchDsub('settings');
      });
    }
    if (ddLogout) ddLogout.addEventListener('click', logout);

    document.addEventListener('click', (event) => {
      if (profileDropdown && !profileDropdown.contains(event.target) && !profileChip?.contains(event.target)) {
        profileDropdown.classList.remove('open');
      }
    });
  } else {
    authArea.innerHTML = `
      <a href="/login" class="btn btn-ghost btn-sm">Log in</a>
      <a href="/signup" class="btn btn-primary btn-sm">Sign up</a>`;
  }
}

function logout() {
  clearSession();
  renderAuthArea();
  window.location.href = '/';
}

async function verifySessionFromStorage() {
  const stored = loadStoredSession();
  if (!stored || !stored.token) return false;

  authToken = stored.token;
  currentUser = stored.user;
  renderAuthArea();

  try {
    const res = await apiFetch('/api/auth/me');
    if (res.ok) {
      currentUser = await safeJson(res);
      saveSession(authToken, currentUser);
      return true;
    }
    clearSession();
    renderAuthArea();
    return false;
  } catch (e) {
    return true;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  applySettings(loadSettings());
  const currentPath = window.location.pathname;
  const currentSearch = new URLSearchParams(window.location.search);

  const stored = loadStoredSession();
  if (stored && stored.token) {
    authToken = stored.token;
    currentUser = stored.user;
  }

  if (currentPath === '/dashboard') {
    const tokenFromQuery = currentSearch.get('google_token');
    if (tokenFromQuery) {
      authToken = tokenFromQuery;
      const meRes = await apiFetch('/api/auth/me');
      if (meRes.ok) {
        currentUser = await safeJson(meRes);
        saveSession(authToken, currentUser);
      } else {
        const data = await safeJson(meRes);
        console.warn('Google token validation failed:', data.detail || 'Unknown error');
        clearSession();
      }
      history.replaceState(null, '', '/dashboard');
    }
  }

  await verifySessionFromStorage();
  renderAuthArea();

  if (currentPath === '/dashboard' && !currentUser) {
    const next = encodeURIComponent(currentPath + currentSearch.toString());
    window.location.href = `/login?next=${next}`;
    return;
  }

  if (document.getElementById('themeToggle')) {
    document.getElementById('themeToggle').addEventListener('click', () => {
      const settings = loadSettings();
      settings.theme = settings.theme === 'light' ? 'dark' : 'light';
      saveSettings(settings);
      applySettings(settings);
    });
  }

  if (document.getElementById('notifToggle')) {
    document.getElementById('notifToggle').addEventListener('click', () => {
      const settings = loadSettings();
      settings.notifications = !settings.notifications;
      saveSettings(settings);
      applySettings(settings);
    });
  }

  if (document.getElementById('languageSelect')) {
    document.getElementById('languageSelect').addEventListener('change', () => {
      const settings = loadSettings();
      settings.language = document.getElementById('languageSelect').value;
      saveSettings(settings);
    });
  }
});
