// Encrypts specific sensitive fields (customer names, phones, addresses)
// before they're written to disk, and decrypts them when read back.
//
// This protects against someone getting hold of just the data file or a
// backup in isolation (e.g. a leaked backup copy) — it does NOT protect
// against someone with full access to the running server, since the key
// lives in the same environment the app needs to read it from. That's an
// inherent limit of any single-server setup without a separate key vault.
//
// Uses AES-256-GCM, Node's built-in crypto module — no extra dependency.
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const keyHex = process.env.ENCRYPTION_KEY;

let key = null;
if (keyHex) {
  if (/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    key = Buffer.from(keyHex, 'hex'); // a 64-character hex key is used as-is
  } else if (keyHex.length >= 32) {
    // Any long passphrase also works (handy if you can only type it by hand):
    // it is stretched into a proper 32-byte key.
    key = crypto.createHash('sha256').update(keyHex).digest();
  } else {
    console.warn('⚠️  ENCRYPTION_KEY is too short (needs 32+ characters) — encryption is DISABLED until this is fixed. Generate one with: node setup-encryption.js');
  }
} else {
  console.warn('⚠️  ENCRYPTION_KEY is not set — customer names, phones and addresses will be stored in plain text. Run: node setup-encryption.js');
}

const isEnabled = !!key;
const PREFIX = 'enc:';

function encrypt(text) {
  if (!isEnabled || text === null || text === undefined || text === '') return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return PREFIX + iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(value) {
  // Not encrypted (encryption was off when written, or it's not a string at all) — return as-is.
  // This makes turning encryption on/off safe at any time: old plain-text data keeps working,
  // it just won't be encrypted retroactively until it's next written.
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  if (!isEnabled) return value; // we can't decrypt without the key, but we also shouldn't crash

  try {
    const [, ivHex, tagHex, dataHex] = value.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('Decryption failed for a field (wrong key?) — returning encrypted placeholder:', err.message);
    return '[unreadable]';
  }
}

// A searchable fingerprint of a value (used to find an account by phone number
// without storing the phone number readably). With a key set it is an HMAC, so the
// fingerprint can't be reversed by guessing phone numbers; without a key it is a
// plain hash. plainIndex() is what blindIndex() produced before a key was added,
// so accounts created earlier can still be found (and are upgraded on next login).
function plainIndex(value) {
  return crypto.createHash('sha256').update('idx:' + value).digest('hex');
}
function blindIndex(value) {
  if (!isEnabled) return plainIndex(value);
  return crypto.createHmac('sha256', key).update('idx:' + value).digest('hex');
}

module.exports = { encrypt, decrypt, isEnabled, blindIndex, plainIndex };
