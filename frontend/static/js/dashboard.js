document.addEventListener('DOMContentLoaded', async () => {
  const dashWelcome = document.getElementById('dashWelcome');
  const useSavedResumeBtn = document.getElementById('useSavedResumeBtn');
  const resumeUpcard = document.getElementById('resumeUpcard');
  const resumeFileInput = document.getElementById('resumeFileInput');
  const resumeFileNameEl = document.getElementById('resumeFileName');
  const resumeHint = document.getElementById('resumeHint');
  const browseResumeBtn = document.getElementById('browseResumeBtn');
  const jdToggle = document.getElementById('jdToggle');
  const jdActionBtn = document.getElementById('jdActionBtn');
  const jdTextarea = document.getElementById('jdTextarea');
  const jdFileInput = document.getElementById('jdFileInput');
  const jdFileNameEl = document.getElementById('jdFileName');
  const jobTitleInput = document.getElementById('jobTitleInput');
  const analyzeError = document.getElementById('analyzeError');
  const runAnalysisBtn = document.getElementById('runAnalysisBtn');
  const resultBlock = document.getElementById('resultBlock');
  const gaugeRing = document.getElementById('gaugeRing');
  const gaugeNum = document.getElementById('gaugeNum');
  const resSummaryTitle = document.getElementById('resSummaryTitle');
  const resSummaryText = document.getElementById('resSummaryText');
  const chipsContainer = document.getElementById('chipsContainer');
  const recommendationsPanel = document.getElementById('recommendationsPanel');
  const recommendationsList = document.getElementById('recommendationsList');
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const saveReportBtn = document.getElementById('saveReportBtn');
  const recentList = document.getElementById('recentList');
  const historyTableBody = document.getElementById('historyTableBody');
  const historyCount = document.getElementById('historyCount');
  const historySearch = document.getElementById('historySearch');
  const defaultResumeInput = document.getElementById('defaultResumeInput');
  const uploadDefaultResumeBtn = document.getElementById('uploadDefaultResumeBtn');
  const removeDefaultResumeBtn = document.getElementById('removeDefaultResumeBtn');
  const profileSavedNote = document.getElementById('profileSavedNote');
  const themeToggle = document.getElementById('themeToggle');
  const notifToggle = document.getElementById('notifToggle');
  const languageSelect = document.getElementById('languageSelect');
  const deleteAccountBtn = document.getElementById('deleteAccountBtn');

  let selectedResumeFile = null;
  let useSavedResume = false;
  let jdMode = 'paste';
  let jdTextareaOpen = false;
  let jdFileText = null;
  let lastAnalysis = null;
  let lastAnalysisId = null;
  let allHistoryItems = [];

  function showError(msg) {
    if (analyzeError) {
      analyzeError.textContent = msg;
      analyzeError.style.display = 'block';
    }
  }

  function clearError() {
    if (analyzeError) {
      analyzeError.style.display = 'none';
      analyzeError.textContent = '';
    }
  }

  function switchDsub(name) {
    document.querySelectorAll('.dsub button').forEach((btn) => btn.classList.toggle('on', btn.dataset.dsub === name));
    document.querySelectorAll('.dsub-panel').forEach((panel) => panel.classList.remove('on'));
    const panel = document.getElementById('dsub-' + name);
    if (panel) panel.classList.add('on');
  }
  window.switchDsub = switchDsub;

  document.querySelectorAll('.dsub button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.dsub;
      switchDsub(target);
      if (target === 'history') loadHistory();
    });
  });

  if (!currentUser) {
    window.location.href = '/login';
    return;
  }

  if (dashWelcome) {
    dashWelcome.textContent = `Welcome back, ${currentUser.name}`;
  }

  function saveSettingsFromDashboard() {
    const settings = loadSettings();
    if (themeToggle) themeToggle.classList.toggle('on', settings.theme !== 'light');
    if (notifToggle) notifToggle.classList.toggle('on', !!settings.notifications);
    if (languageSelect) languageSelect.value = settings.language || 'English';
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const settings = loadSettings();
      settings.theme = settings.theme === 'light' ? 'dark' : 'light';
      saveSettings(settings);
      applySettings(settings);
    });
  }
  if (notifToggle) {
    notifToggle.addEventListener('click', () => {
      const settings = loadSettings();
      settings.notifications = !settings.notifications;
      saveSettings(settings);
      applySettings(settings);
    });
  }
  if (languageSelect) {
    languageSelect.addEventListener('change', () => {
      const settings = loadSettings();
      settings.language = languageSelect.value;
      saveSettings(settings);
    });
  }

  function populateProfileFields() {
    const rows = document.querySelectorAll('#dsub-myprofile .set-row[data-field]');
    rows.forEach((row) => {
      const field = row.dataset.field;
      const valueEl = row.querySelector('[data-value]');
      if (!valueEl) return;
      const val = currentUser[field];
      if (field === 'email') {
        valueEl.textContent = currentUser.email;
      } else {
        valueEl.textContent = val && val.trim() ? val : 'Not added';
        const editBtn = row.querySelector('[data-edit]');
        if (editBtn) editBtn.textContent = val && val.trim() ? 'Edit' : 'Add';
      }
    });

    const statusEl = document.getElementById('defaultResumeStatus');
    if (statusEl) {
      if (currentUser.has_default_resume) {
        statusEl.textContent = currentUser.default_resume_filename;
        if (removeDefaultResumeBtn) removeDefaultResumeBtn.style.display = 'inline-flex';
        if (useSavedResumeBtn) useSavedResumeBtn.style.display = 'inline-flex';
      } else {
        statusEl.textContent = 'None uploaded';
        if (removeDefaultResumeBtn) removeDefaultResumeBtn.style.display = 'none';
        if (useSavedResumeBtn) useSavedResumeBtn.style.display = 'none';
      }
    }
  }

  document.querySelectorAll('#dsub-myprofile .set-row[data-field] [data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.set-row');
      const field = row.dataset.field;
      if (field === 'email') return;
      const container = row.querySelector('div');
      const valueEl = row.querySelector('[data-value]');
      const currentVal = (currentUser[field] || '').trim();
      if (row.querySelector('input[data-editing]')) return;

      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentVal;
      input.setAttribute('data-editing', 'true');
      valueEl.style.display = 'none';
      container.appendChild(input);
      input.focus();

      const originalLabel = btn.textContent;
      btn.textContent = 'Save';

      const finishEdit = async (save) => {
        if (save) {
          const newVal = input.value.trim();
          try {
            const res = await apiFetch('/api/auth/me', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ [field]: newVal })
            });
            const data = await safeJson(res);
            if (!res.ok) throw new Error(data.detail || 'Could not save profile.');
            currentUser = data;
            saveSession(authToken, currentUser);
            renderAuthArea();
          } catch (err) {
            alert(err.message);
          }
        }
        input.remove();
        valueEl.style.display = '';
        populateProfileFields();
        btn.textContent = originalLabel;
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishEdit(true);
        if (e.key === 'Escape') finishEdit(false);
      });
      btn.onclick = () => finishEdit(true);
    });
  });

  function flashSaved() {
    if (profileSavedNote) {
      profileSavedNote.style.display = 'block';
      setTimeout(() => (profileSavedNote.style.display = 'none'), 2000);
    }
  }

  if (uploadDefaultResumeBtn) {
    uploadDefaultResumeBtn.addEventListener('click', () => defaultResumeInput.click());
  }
  if (defaultResumeInput) {
    defaultResumeInput.addEventListener('change', async () => {
      const file = defaultResumeInput.files[0];
      if (!file) return;
      if (!/\.(pdf|docx)$/i.test(file.name)) {
        alert('Only PDF or DOCX resumes are supported.');
        return;
      }
      const formData = new FormData();
      formData.append('resume', file);
      try {
        const res = await apiFetch('/api/auth/me/resume', { method: 'POST', body: formData });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.detail || 'Upload failed.');
        currentUser.has_default_resume = true;
        currentUser.default_resume_filename = data.filename;
        saveSession(authToken, currentUser);
        populateProfileFields();
        flashSaved();
      } catch (err) {
        alert(err.message);
      }
    });
  }
  if (removeDefaultResumeBtn) {
    removeDefaultResumeBtn.addEventListener('click', async () => {
      if (!confirm('Remove your saved resume?')) return;
      try {
        const res = await apiFetch('/api/auth/me/resume', { method: 'DELETE' });
        if (!res.ok) throw new Error('Could not remove saved resume.');
        currentUser.has_default_resume = false;
        currentUser.default_resume_filename = null;
        saveSession(authToken, currentUser);
        populateProfileFields();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener('click', async () => {
      if (!confirm('This permanently deletes your account and all saved reports. Continue?')) return;
      try {
        const res = await apiFetch('/api/auth/me', { method: 'DELETE' });
        if (!res.ok) throw new Error('Could not delete account.');
        clearSession();
        renderAuthArea();
        window.location.href = '/';
      } catch (err) {
        alert(err.message);
      }
    });
  }

  if (browseResumeBtn) browseResumeBtn.addEventListener('click', (e) => { e.stopPropagation(); resumeFileInput.click(); });
  if (resumeUpcard) {
    resumeUpcard.addEventListener('click', (e) => {
      if (e.target === useSavedResumeBtn) return;
      resumeFileInput.click();
    });
  }
  if (resumeFileInput) {
    resumeFileInput.addEventListener('change', () => {
      if (resumeFileInput.files && resumeFileInput.files[0]) setResumeFile(resumeFileInput.files[0]);
    });
  }
  if (useSavedResumeBtn) {
    useSavedResumeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      useSavedResume = true;
      selectedResumeFile = null;
      if (resumeFileNameEl) {
        resumeFileNameEl.textContent = `Using saved resume: ${currentUser.default_resume_filename}`;
        resumeFileNameEl.style.display = 'block';
      }
      if (resumeHint) resumeHint.textContent = 'Or drop/browse a different file to use instead.';
      clearError();
    });
  }
  if (resumeUpcard) {
    ['dragover', 'dragenter'].forEach((evt) => resumeUpcard.addEventListener(evt, (e) => {
      e.preventDefault();
      resumeUpcard.style.borderColor = 'var(--lime)';
    }));
    ['dragleave', 'dragend'].forEach((evt) => resumeUpcard.addEventListener(evt, () => {
      resumeUpcard.style.borderColor = '';
    }));
    resumeUpcard.addEventListener('drop', (e) => {
      e.preventDefault();
      resumeUpcard.style.borderColor = '';
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) setResumeFile(file);
    });
  }

  function setResumeFile(file) {
    const validExt = /\.(pdf|docx)$/i.test(file.name);
    if (!validExt) {
      showError('Only PDF or DOCX resumes are supported.');
      return;
    }
    clearError();
    useSavedResume = false;
    selectedResumeFile = file;
    if (resumeFileNameEl) {
      resumeFileNameEl.textContent = `Selected: ${file.name}`;
      resumeFileNameEl.style.display = 'block';
    }
    if (resumeHint) resumeHint.textContent = 'Looks good. Drop a different file to replace it.';
  }

  function setJdMode(mode) {
    jdMode = mode;
    jdTextareaOpen = false;
    if (jdTextarea) jdTextarea.style.display = 'none';
    if (jobTitleInput) jobTitleInput.style.display = 'none';
    if (jdFileNameEl) jdFileNameEl.style.display = 'none';
    jdFileText = null;

    if (mode === 'paste') {
      if (jdHint) jdHint.textContent = 'Paste the full JD or upload a .txt/.pdf';
      if (jdActionBtn) jdActionBtn.textContent = 'Open text area';
    } else {
      if (jdHint) jdHint.textContent = 'Upload a .txt or .pdf file containing the job description';
      if (jdActionBtn) jdActionBtn.textContent = 'Browse file';
    }
  }

  if (jdToggle) {
    jdToggle.querySelectorAll('button[data-jdmode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        jdToggle.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
        btn.classList.add('on');
        setJdMode(btn.dataset.jdmode);
      });
    });
  }

  if (jdActionBtn) {
    jdActionBtn.addEventListener('click', () => {
      if (jdMode === 'paste') {
        jdTextareaOpen = !jdTextareaOpen;
        if (jdTextarea) jdTextarea.style.display = jdTextareaOpen ? 'block' : 'none';
        if (jobTitleInput) jobTitleInput.style.display = jdTextareaOpen ? 'block' : 'none';
        jdActionBtn.textContent = jdTextareaOpen ? 'Close text area' : 'Open text area';
        if (jdTextareaOpen && jdTextarea) jdTextarea.focus();
      } else {
        jdFileInput.click();
      }
    });
  }

  if (jdFileInput) {
    jdFileInput.addEventListener('change', async () => {
      const file = jdFileInput.files && jdFileInput.files[0];
      if (!file) return;

      const validExt = /\.(pdf|txt)$/i.test(file.name);
      if (!validExt) {
        showError('Job description file must be .txt or .pdf');
        return;
      }
      if (jdFileNameEl) {
        jdFileNameEl.textContent = `Reading ${file.name}...`;
        jdFileNameEl.style.display = 'block';
      }

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await apiFetch('/api/parse-jd-file', { method: 'POST', body: formData });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.detail || 'Could not read job description file.');
        jdFileText = data.text;
        if (jdFileNameEl) jdFileNameEl.textContent = `Loaded: ${file.name} (${jdFileText.split(/\s+/).length} words)`;
        if (jobTitleInput) jobTitleInput.style.display = 'block';
        clearError();
      } catch (err) {
        showError(err.message);
        if (jdFileNameEl) jdFileNameEl.style.display = 'none';
        jdFileText = null;
      }
    });
  }

  function setRunning(isRunning) {
    if (runAnalysisBtn) {
      runAnalysisBtn.disabled = isRunning;
      runAnalysisBtn.textContent = isRunning ? 'Analyzing...' : 'Run analysis →';
    }
  }

  if (runAnalysisBtn) {
    runAnalysisBtn.addEventListener('click', async () => {
      clearError();

      const jdText = jdMode === 'paste' ? (jdTextarea?.value || '').trim() : (jdFileText || '').trim();

      if (!selectedResumeFile && !useSavedResume) {
        showError('Please upload a resume (PDF or DOCX), or use your saved resume from My Profile.');
        return;
      }
      if (!jdText) {
        showError(jdMode === 'paste' ? 'Please paste a job description before running the analysis.' : 'Please upload a job description file before running the analysis.');
        return;
      }

      const formData = new FormData();
      if (useSavedResume) {
        formData.append('use_saved_resume', 'true');
      } else {
        formData.append('resume', selectedResumeFile);
      }
      formData.append('job_description', jdText);
      formData.append('job_title', (jobTitleInput?.value || '').trim());
      formData.append('save', 'true');

      setRunning(true);
      try {
        const res = await apiFetch('/api/analyze', { method: 'POST', body: formData });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.detail || 'Analysis failed. Please try again.');

        lastAnalysis = data;
        lastAnalysisId = data.id || null;
        renderResult(data);
        await loadRecent();
        if (document.getElementById('dsub-history').classList.contains('on')) {
          await loadHistory();
        }
      } catch (err) {
        showError(err.message);
      } finally {
        setRunning(false);
      }
    });
  }

  function makeChip(text, kind) {
    const span = document.createElement('span');
    span.className = `chip ${kind}`;
    span.textContent = kind === 'missing' ? `${text} ↗` : text;
    return span;
  }

  function animateGauge(target) {
    const circumference = 440;
    let n = 0;
    if (gaugeNum) gaugeNum.textContent = '0%';
    if (gaugeRing) gaugeRing.style.stroke = target >= 60 ? 'var(--lime)' : 'var(--coral)';
    const iv = setInterval(() => {
      n++;
      if (gaugeNum) gaugeNum.textContent = n + '%';
      if (gaugeRing) gaugeRing.style.strokeDashoffset = circumference - (circumference * n) / 100;
      if (n >= target) clearInterval(iv);
    }, 12);
  }

  function renderResult(data) {
    if (resultBlock) resultBlock.classList.add('show');
    animateGauge(Math.round(data.match_score));

    const matchedCount = data.matched_skills.length;
    const totalRequired = data.required_skills.length;
    const missingCount = data.missing_skills.length;

    let title;
    if (totalRequired === 0) {
      title = 'No specific skills detected in the job description';
    } else if (data.match_score >= 75) {
      title = 'Strong fit — a few gaps to close';
    } else if (data.match_score >= 45) {
      title = 'Moderate fit — worth tailoring your resume';
    } else {
      title = 'Weak fit — significant gaps to address';
    }

    if (resSummaryTitle) resSummaryTitle.textContent = title;
    if (resSummaryText) {
      resSummaryText.textContent = totalRequired === 0
        ? "We couldn't detect specific required skills in this job description — try pasting the full listing including the requirements section."
        : `You match ${matchedCount} of ${totalRequired} required skills for this role. ` +
          (missingCount > 0 ? `Close the ${missingCount} missing one${missingCount === 1 ? '' : 's'} below to strengthen your fit.` : 'You match every required skill detected — great fit.');
    }

    if (chipsContainer) {
      chipsContainer.innerHTML = '';
      data.matched_skills.forEach((skill) => chipsContainer.appendChild(makeChip(skill, 'matched')));
      data.missing_skills.forEach((skill) => chipsContainer.appendChild(makeChip(skill, 'missing')));
    }

    if (data.recommendations && data.recommendations.length > 0) {
      if (recommendationsPanel) recommendationsPanel.style.display = 'block';
      if (recommendationsList) {
        recommendationsList.innerHTML = '';
        data.recommendations.forEach((rec) => {
          const row = document.createElement('div');
          row.className = 'rrow';
          row.innerHTML = `
            <div>
              <div class="rt">${escapeHtml(rec.skill)}</div>
              <div class="rd">${escapeHtml(rec.title)}</div>
            </div>
            <a href="${escapeAttr(rec.url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">Open ↗</a>
          `;
          recommendationsList.appendChild(row);
        });
      }
    } else if (recommendationsPanel) {
      recommendationsPanel.style.display = 'none';
    }

    if (saveReportBtn) saveReportBtn.textContent = lastAnalysisId ? 'Saved ✓' : 'Save report';
    if (resultBlock) resultBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', async () => {
      if (!lastAnalysisId) {
        showError('Run an analysis first — reports are saved automatically before exporting.');
        return;
      }
      try {
        const res = await apiFetch(`/api/export/${lastAnalysisId}`);
        if (!res.ok) throw new Error('Could not generate the PDF report.');
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
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
  }

  if (saveReportBtn) {
    saveReportBtn.addEventListener('click', () => {
      if (!lastAnalysisId) return;
      saveReportBtn.textContent = 'Saved ✓';
    });
  }

  function scoreClass(score) {
    if (score >= 70) return 'hi';
    if (score >= 45) return 'mid';
    return 'lo';
  }

  function formatDate(isoLike) {
    if (!isoLike) return '';
    const d = new Date(isoLike.replace(' ', 'T'));
    if (isNaN(d.getTime())) return isoLike;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function makeRecentRow(item) {
    const row = document.createElement('div');
    row.className = 'rrow';
    const label = item.job_title || item.resume_filename || 'Untitled analysis';
    row.innerHTML = `
      <div><div class="rt">${escapeHtml(label)}</div><div class="rd">${escapeHtml(formatDate(item.created_at))}</div></div>
      <span class="pill ${scoreClass(item.match_score)}">${Math.round(item.match_score)}%</span>
    `;
    return row;
  }

  async function loadRecent() {
    if (!currentUser || !recentList) return;
    try {
      const res = await apiFetch('/api/history');
      if (!res.ok) return;
      const items = await safeJson(res);
      recentList.innerHTML = '';
      if (items.length === 0) {
        recentList.innerHTML = '<div class="rrow"><div><div class="rt">No analyses yet</div><div class="rd">Run your first analysis above</div></div></div>';
        return;
      }
      items.slice(0, 3).forEach((item) => recentList.appendChild(makeRecentRow(item)));
    } catch (e) {
      // ignore
    }
  }

  function renderHistoryTable(items) {
    if (!historyCount || !historyTableBody) return;
    historyCount.textContent = `${items.length} saved report${items.length === 1 ? '' : 's'}`;
    historyTableBody.innerHTML = '';

    if (items.length === 0) {
      historyTableBody.innerHTML = '<tr><td colspan="4" style="color:var(--text3); font-size:13px;">No saved reports yet.</td></tr>';
      return;
    }

    items.forEach((item) => {
      const tr = document.createElement('tr');
      const label = item.job_title || item.resume_filename || 'Untitled analysis';
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

  async function loadHistory() {
    if (!currentUser) return;
    try {
      const res = await apiFetch('/api/history');
      if (!res.ok) return;
      allHistoryItems = await safeJson(res);
      renderHistoryTable(allHistoryItems);
    } catch (e) {
      // ignore
    }
  }

  if (historyTableBody) {
    historyTableBody.addEventListener('click', async (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const id = target.dataset.id;

      if (target.dataset.action === 'delete') {
        if (!confirm('Delete this saved report?')) return;
        await apiFetch(`/api/history/${id}`, { method: 'DELETE' });
        await loadHistory();
        await loadRecent();
      } else if (target.dataset.action === 'view') {
        try {
          const res = await apiFetch(`/api/history/${id}`);
          const record = await safeJson(res);
          if (!res.ok) throw new Error(record.detail || 'Could not load report.');
          lastAnalysisId = record.id;
          renderResult({
            match_score: record.match_score,
            matched_skills: record.matched_skills,
            missing_skills: record.missing_skills,
            required_skills: [...record.matched_skills, ...record.missing_skills],
            recommendations: record.recommendations
          });
          switchDsub('new');
        } catch (err) {
          alert(err.message);
        }
      }
    });
  }

  if (historySearch) {
    historySearch.addEventListener('input', () => {
      const q = historySearch.value.trim().toLowerCase();
      const filtered = allHistoryItems.filter((item) => {
        const label = (item.job_title || item.resume_filename || '').toLowerCase();
        return label.includes(q);
      });
      renderHistoryTable(filtered);
    });
  }

  saveSettingsFromDashboard();
  populateProfileFields();
  await loadRecent();
  await loadHistory();
});
