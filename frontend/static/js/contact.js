document.addEventListener('DOMContentLoaded', () => {
  const contactSubmitBtn = document.getElementById('contactSubmitBtn');
  const contactNameInput = document.getElementById('contactNameInput');
  const contactEmailInput = document.getElementById('contactEmailInput');
  const contactMessageInput = document.getElementById('contactMessageInput');
  const contactStatus = document.getElementById('contactStatus');

  if (!contactSubmitBtn) return;

  contactSubmitBtn.addEventListener('click', async () => {
    const name = (contactNameInput?.value || '').trim();
    const email = (contactEmailInput?.value || '').trim();
    const message = (contactMessageInput?.value || '').trim();

    if (!contactStatus) return;

    if (!message) {
      contactStatus.style.color = 'var(--coral)';
      contactStatus.textContent = 'Please write a message before sending.';
      contactStatus.style.display = 'block';
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message })
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.detail || 'Could not send message.');
      contactStatus.style.color = 'var(--lime)';
      contactStatus.textContent = 'Message saved — thanks for reaching out!';
      contactStatus.style.display = 'block';
      if (contactNameInput) contactNameInput.value = '';
      if (contactEmailInput) contactEmailInput.value = '';
      if (contactMessageInput) contactMessageInput.value = '';
    } catch (err) {
      contactStatus.style.color = 'var(--coral)';
      contactStatus.textContent = err.message;
      contactStatus.style.display = 'block';
    }
  });
});
