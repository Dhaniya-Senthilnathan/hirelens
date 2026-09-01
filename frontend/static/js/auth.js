document.addEventListener('DOMContentLoaded', () => {
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const tabSignin = document.getElementById('tabSignin');
  const tabSignup = document.getElementById('tabSignup');
  const authNameInput = document.getElementById('authNameInput');
  const authEmailInput = document.getElementById('authEmailInput');
  const authPasswordInput = document.getElementById('authPasswordInput');
  const authConfirmInput = document.getElementById('authConfirmInput');
  const authTermsCheckbox = document.getElementById('authTermsCheckbox');
  const authError = document.getElementById('authError');
  const authNote = document.getElementById('authNote');
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');
  const authNormalPanel = document.getElementById('authNormalPanel');
  const authResetPanel = document.getElementById('authResetPanel');
  const backToSigninLink = document.getElementById('backToSigninLink');
  const resetRequestBtn = document.getElementById('resetRequestBtn');
  const resetSubmitBtn = document.getElementById('resetSubmitBtn');
  const resetEmailInput = document.getElementById('resetEmailInput');
  const resetNewPasswordInput = document.getElementById('resetNewPasswordInput');
  const resetConfirmPasswordInput = document.getElementById('resetConfirmPasswordInput');
  const resetStep1Error = document.getElementById('resetStep1Error');
  const resetStep2Error = document.getElementById('resetStep2Error');
  const resetStep2 = document.getElementById('resetStep2');
  const resetEmailField = document.getElementById('resetEmailField');
  const googleOauthBtn = document.getElementById('googleOauthBtn');

  let activeResetToken = null;

  function clearAuthError() {
    if (authError) {
      authError.style.display = 'none';
      authError.textContent = '';
    }
  }

  function showAuthError(msg) {
    if (authError) {
      authError.textContent = msg;
      authError.style.display = 'block';
    }
  }

  function setAuthTab(which) {
    const isSignup = which === 'signup';
    if (tabSignin) tabSignin.classList.toggle('on', !isSignup);
    if (tabSignup) tabSignup.classList.toggle('on', isSignup);
    document.querySelectorAll('.field-signup').forEach((field) => field.classList.toggle('show', isSignup));
    if (authSubmitBtn) authSubmitBtn.textContent = isSignup ? 'Create account' : 'Sign in';
    clearAuthError();
  }

  if (tabSignin) tabSignin.addEventListener('click', () => setAuthTab('signin'));
  if (tabSignup) tabSignup.addEventListener('click', () => setAuthTab('signup'));

  function onAuthSuccess(data) {
    saveSession(data.access_token, data.user);
    renderAuthArea();
    if (authNote) authNote.classList.remove('show');
    clearAuthError();
    if (authNameInput) authNameInput.value = '';
    if (authEmailInput) authEmailInput.value = '';
    if (authPasswordInput) authPasswordInput.value = '';
    if (authConfirmInput) authConfirmInput.value = '';
    if (authTermsCheckbox) authTermsCheckbox.checked = false;

    const nextParam = new URLSearchParams(window.location.search).get('next');
    const nextTarget = nextParam || '/dashboard';
    window.location.href = nextTarget;
  }

  const loginNext = new URLSearchParams(window.location.search).get('next');
  if (authNote) {
    if (loginNext) {
      authNote.textContent = 'Sign in to continue to your dashboard.';
      authNote.classList.add('show');
    } else {
      authNote.textContent = 'Log in to view your dashboard.';
      authNote.classList.remove('show');
    }
  }

  if (authSubmitBtn) {
    authSubmitBtn.addEventListener('click', async () => {
      const isSignup = tabSignup && tabSignup.classList.contains('on');
      const email = (authEmailInput?.value || '').trim();
      const password = authPasswordInput?.value || '';

      clearAuthError();

      if (isSignup) {
        const name = (authNameInput?.value || '').trim();
        const confirm = authConfirmInput?.value || '';
        const agreed = authTermsCheckbox?.checked;

        if (!name) return showAuthError('Please enter your full name.');
        if (!email) return showAuthError('Please enter your email.');
        if (password.length < 6) return showAuthError('Password must be at least 6 characters.');
        if (password !== confirm) return showAuthError('Passwords do not match.');
        if (!agreed) return showAuthError('Please agree to the terms and privacy policy.');

        try {
          const res = await apiFetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
          });
          const data = await safeJson(res);
          if (!res.ok) throw new Error(data.detail || 'Could not create account.');
          onAuthSuccess(data);
        } catch (err) {
          showAuthError(err.message);
        }
      } else {
        if (!email || !password) return showAuthError('Please enter your email and password.');
        try {
          const res = await apiFetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const data = await safeJson(res);
          if (!res.ok) throw new Error(data.detail || 'Login failed.');
          onAuthSuccess(data);
        } catch (err) {
          showAuthError(err.message);
        }
      }
    });
  }

  function showResetPanel() {
    if (authNormalPanel) authNormalPanel.style.display = 'none';
    if (authResetPanel) authResetPanel.style.display = 'block';
    if (resetStep2) resetStep2.style.display = 'none';
    if (resetEmailField) resetEmailField.style.display = 'block';
    if (resetRequestBtn) resetRequestBtn.style.display = 'block';
    if (resetEmailInput) resetEmailInput.value = '';
    if (resetNewPasswordInput) resetNewPasswordInput.value = '';
    if (resetConfirmPasswordInput) resetConfirmPasswordInput.value = '';
    clearResetErrors();
    if (authNote) authNote.classList.remove('show');
  }

  function hideResetPanel() {
    if (authResetPanel) authResetPanel.style.display = 'none';
    if (authNormalPanel) authNormalPanel.style.display = 'block';
    clearAuthError();
  }

  function clearResetErrors() {
    if (resetStep1Error) { resetStep1Error.style.display = 'none'; resetStep1Error.textContent = ''; }
    if (resetStep2Error) { resetStep2Error.style.display = 'none'; resetStep2Error.textContent = ''; }
  }

  if (forgotPasswordLink) forgotPasswordLink.addEventListener('click', showResetPanel);
  if (backToSigninLink) backToSigninLink.addEventListener('click', hideResetPanel);

  if (resetRequestBtn) {
    resetRequestBtn.addEventListener('click', async () => {
      clearResetErrors();
      const email = (resetEmailInput?.value || '').trim();
      if (!email) {
        if (resetStep1Error) {
          resetStep1Error.textContent = 'Please enter your account email.';
          resetStep1Error.style.display = 'block';
        }
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.detail || 'Something went wrong.');

        if (!data.reset_token) {
          if (resetStep1Error) {
            resetStep1Error.textContent = 'If that email has an account, you can now set a new password below.';
            resetStep1Error.style.color = 'var(--text2)';
            resetStep1Error.style.display = 'block';
          }
          return;
        }

        activeResetToken = data.reset_token;
        if (resetEmailField) resetEmailField.style.display = 'none';
        if (resetRequestBtn) resetRequestBtn.style.display = 'none';
        if (resetStep2) resetStep2.style.display = 'block';
      } catch (err) {
        if (resetStep1Error) {
          resetStep1Error.textContent = err.message;
          resetStep1Error.style.color = 'var(--coral)';
          resetStep1Error.style.display = 'block';
        }
      }
    });
  }

  if (resetSubmitBtn) {
    resetSubmitBtn.addEventListener('click', async () => {
      clearResetErrors();
      const newPassword = resetNewPasswordInput?.value || '';
      const confirmPassword = resetConfirmPasswordInput?.value || '';

      if (newPassword.length < 6) {
        if (resetStep2Error) {
          resetStep2Error.textContent = 'Password must be at least 6 characters.';
          resetStep2Error.style.display = 'block';
        }
        return;
      }
      if (newPassword !== confirmPassword) {
        if (resetStep2Error) {
          resetStep2Error.textContent = 'Passwords do not match.';
          resetStep2Error.style.display = 'block';
        }
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: activeResetToken, new_password: newPassword })
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.detail || 'Could not reset password.');

        hideResetPanel();
        setAuthTab('signin');
        if (authNote) {
          authNote.textContent = 'Password updated — please sign in.';
          authNote.classList.add('show');
        }
      } catch (err) {
        if (resetStep2Error) {
          resetStep2Error.textContent = err.message;
          resetStep2Error.style.display = 'block';
        }
      }
    });
  }

  if (googleOauthBtn) {
    googleOauthBtn.addEventListener('click', async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/google/status`);
        const data = await safeJson(res);
        if (data.configured) {
          const nextParam = new URLSearchParams(window.location.search).get('next');
          const nextTarget = nextParam ? `?next=${encodeURIComponent(nextParam)}` : '?next=%2Fdashboard';
          window.location.href = `${API_BASE}/api/auth/google/login${nextTarget}`;
        } else {
          showAuthError(
            "Google sign-in isn't configured on this server yet. It needs a Google Cloud OAuth client (see README.md → Google Sign-In Setup) — until then, please use email login."
          );
        }
      } catch (e) {
        showAuthError("Couldn't reach the backend to check Google sign-in status. Please use email login.");
      }
    });
  }

  const currentSearch = new URLSearchParams(window.location.search);
  const googleToken = currentSearch.get('google_token');
  if (googleToken) {
    saveSession(googleToken, currentUser || null);
    const target = currentSearch.get('next') || '/dashboard';
    history.replaceState(null, '', target);
    window.location.href = target;
  }
});
