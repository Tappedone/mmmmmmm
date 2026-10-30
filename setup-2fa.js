// Run this once to turn on 2FA for your admin account:
//   node setup-2fa.js
//
// It generates a new secret, shows it as a QR code you scan with Google
// Authenticator / Authy / any TOTP app, and tells you what to add to .env.
const otplib = require('otplib');
const qrcode = require('qrcode');

(async () => {
  const secret = await otplib.generateSecret();
  const username = process.env.ADMIN_USERNAME || 'admin';
  const uri = await otplib.generateURI({
    secret,
    label: username,
    issuer: 'Maison Bennani'
  });

  console.log('\n========================================');
  console.log('  Scan this QR code with Google Authenticator, Authy,');
  console.log('  or any authenticator app:');
  console.log('========================================\n');

  const qr = await qrcode.toString(uri, { type: 'terminal', small: true });
  console.log(qr);

  console.log('Can\'t scan it? Enter this code manually in your app instead:');
  console.log('  ' + secret + '\n');

  console.log('Now add this line to your .env file:\n');
  console.log('  ADMIN_TOTP_SECRET=' + secret + '\n');

  console.log('Once that\'s in .env and the server is restarted, logging into');
  console.log('/admin will also ask for the 6-digit code from your app.\n');
})();
