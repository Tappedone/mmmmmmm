const nodemailer = require('nodemailer');

const isConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
if (isConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
} else {
  console.warn('⚠️  Email is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing in .env). Order/account emails will be skipped. See README "Email setup".');
}

const FROM = process.env.MAIL_FROM || 'Maison Bennani <no-reply@maisonbennani.com>';
const SELLER_EMAIL = process.env.SELLER_EMAIL;

async function send(to, subject, html) {
  if (!transporter || !to) return;
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
  } catch (err) {
    // Never let a failed email break an order or account action.
    console.error('Email send failed:', err.message);
  }
}

function itemsHtml(items) {
  const rows = items.map(i => `<tr>
    <td style="padding:6px 10px;border-bottom:1px solid #eee">${i.name}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${i.qty}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${i.price} DH</td>
    <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${i.price * i.qty} DH</td>
  </tr>`).join('');
  return `<tr style="background:#f6f2e8">
    <th style="padding:6px 10px;text-align:left;font-size:12px;color:#666">Item</th>
    <th style="padding:6px 10px;text-align:center;font-size:12px;color:#666">Qty</th>
    <th style="padding:6px 10px;text-align:right;font-size:12px;color:#666">Price</th>
    <th style="padding:6px 10px;text-align:right;font-size:12px;color:#666">Total</th>
  </tr>${rows}`;
}

function wrapper(title, bodyHtml) {
  return `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#1a1a1a">
    <h2 style="color:#a5822f;letter-spacing:1px">MAISON BENNANI</h2>
    <h3>${title}</h3>
    ${bodyHtml}
    <p style="color:#888;font-size:12px;margin-top:30px">Maison Bennani — Parfums de luxe</p>
  </div>`;
}

async function sendOrderConfirmation(order) {
  if (!order.email) return;
  const dateStr = new Date(order.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const html = wrapper('Order Confirmed — Receipt', `
    <p>Hi ${order.name},</p>
    <p>Thank you for your order. Here is your receipt:</p>
    <p style="color:#666;font-size:13px">Order <strong>${order.id}</strong> · ${dateStr}</p>
    <table style="width:100%;border-collapse:collapse;margin-top:8px">${itemsHtml(order.items)}</table>
    <table style="width:100%;margin-top:10px;font-size:14px">
      <tr><td style="padding:3px 10px;color:#666">Subtotal</td><td style="padding:3px 10px;text-align:right">${order.subtotal} DH</td></tr>
      <tr><td style="padding:3px 10px;color:#666">Delivery</td><td style="padding:3px 10px;text-align:right">${order.deliveryFee === 0 ? 'Free' : order.deliveryFee + ' DH'}</td></tr>
      <tr><td style="padding:6px 10px;font-weight:bold;border-top:2px solid #c9a24b">Total</td><td style="padding:6px 10px;text-align:right;font-weight:bold;border-top:2px solid #c9a24b">${order.total} DH</td></tr>
    </table>
    <p style="margin-top:16px">Payment method: <strong>Cash on Delivery</strong> — pay when your order arrives.</p>
    <p>Delivering to: ${order.address}, ${order.city}</p>
    <p>We'll email you again when your order status changes.</p>`);
  await send(order.email, `Your receipt — Order ${order.id}`, html);
}

async function sendOrderStatusUpdate(order) {
  if (!order.email) return;
  const html = wrapper('Order Status Update', `
    <p>Hi ${order.name},</p>
    <p>Your order <strong>${order.id}</strong> status has been updated to:</p>
    <p style="font-size:20px;color:#a5822f;font-weight:bold">${order.status}</p>
    <p>Total: ${order.total} DH — Cash on Delivery</p>`);
  await send(order.email, `Order ${order.id} — ${order.status}`, html);
}

async function sendNewOrderAlertToSeller(order) {
  if (!SELLER_EMAIL) return;
  const html = wrapper('New Order Received', `
    <p><strong>${order.name}</strong> just placed a new order.</p>
    <table style="width:100%;border-collapse:collapse">${itemsHtml(order.items)}</table>
    <p style="margin-top:12px"><strong>Total: ${order.total} DH</strong> (Delivery: ${order.deliveryFee} DH)</p>
    <p>Phone: ${order.phone}<br>Address: ${order.address}, ${order.city}</p>
    <p>Log into your admin panel to confirm and process this order.</p>`);
  await send(SELLER_EMAIL, `New order ${order.id} — ${order.total} DH`, html);
}

async function sendWelcomeEmail(customer) {
  const html = wrapper('Welcome to Maison Bennani', `
    <p>Hi ${customer.name},</p>
    <p>Your account has been created. You can now log in anytime to view your order history.</p>`);
  await send(customer.email, 'Welcome to Maison Bennani', html);
}

async function sendPasswordReset(customer, resetUrl) {
  const html = wrapper('Reset Your Password', `
    <p>Hi ${customer.name},</p>
    <p>We received a request to reset your password. Click the button below — this link expires in 1 hour.</p>
    <p style="margin:20px 0"><a href="${resetUrl}" style="background:#c9a24b;color:#141311;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Reset Password</a></p>
    <p style="color:#888;font-size:13px">If you didn't request this, you can safely ignore this email — your password won't change.</p>`);
  await send(customer.email, 'Reset your Maison Bennani password', html);
}

module.exports = {
  isConfigured,
  sendOrderConfirmation,
  sendOrderStatusUpdate,
  sendNewOrderAlertToSeller,
  sendWelcomeEmail,
  sendPasswordReset
};
