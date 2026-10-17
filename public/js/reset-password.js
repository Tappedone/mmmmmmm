const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const email = params.get('email');

if (!token || !email) {
  document.getElementById('msg').textContent = 'This reset link is missing information. Please request a new one from the site.';
  document.getElementById('resetForm').style.display = 'none';
}

document.getElementById('resetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const msg = document.getElementById('msg');
  msg.style.color = 'var(--danger)';
  if (newPassword !== confirmPassword) {
    msg.textContent = 'Passwords do not match.';
    return;
  }
  try {
    const res = await fetch('/api/customers/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    msg.style.color = 'var(--ok)';
    msg.textContent = data.message + ' Redirecting you to the store...';
    setTimeout(() => window.location.href = '/', 2000);
  } catch (err) {
    msg.textContent = err.message;
  }
});
