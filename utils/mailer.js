// Optional: emails YOU when a new order arrives (set SMTP_* and SELLER_EMAIL).
// Customers are not emailed — accounts use phone numbers, and delivery is
// handled with them directly on WhatsApp.
//
// Note: some hosts (including Railway's Hobby plan) block outgoing SMTP, in which
// case this simply logs "Email send failed" and everything else keeps working.
const nodemailer = require('nodemailer');

const isConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SELLER_EMAIL);

let transporter = null;
if (isConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

const FROM = process.env.MAIL_FROM || process.env.SMTP_USER;
const SELLER_EMAIL = process.env.SELLER_EMAIL;

function escapeHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sendNewOrderAlertToSeller(order) {
  if (!transporter) return;
  const rows = order.items.map(i => {
    const inside = Array.isArray(i.bundle)
      ? `<br><span style="color:#777;font-size:12px">${i.bundle.map(b => `${b.qty}× ${escapeHtml(b.name)}`).join(', ')}</span>`
      : '';
    return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(i.name)}${inside}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${i.qty}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${i.price * i.qty} DH</td></tr>`;
  }).join('');

  const html = `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#1a1a1a">
    <h2 style="color:#a5822f">New order ${escapeHtml(order.id)}</h2>
    <p><strong>${escapeHtml(order.name)}</strong> — ${escapeHtml(order.phone)}<br>${escapeHtml(order.address)}, ${escapeHtml(order.city)}</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <p><strong>Total: ${order.total} DH</strong> (delivery ${order.deliveryFee} DH) — Cash on Delivery</p>
    <p>Open your admin panel to confirm it.</p></div>`;

  try {
    await transporter.sendMail({ from: FROM, to: SELLER_EMAIL, subject: `New order ${order.id} — ${order.total} DH`, html });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

module.exports = { isConfigured, sendNewOrderAlertToSeller };
