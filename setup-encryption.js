// Run this once to turn on encryption for stored customer data:
//   node setup-encryption.js
const crypto = require('crypto');

const key = crypto.randomBytes(32).toString('hex');

console.log('\nAdd this to your .env file:\n');
console.log('ENCRYPTION_KEY=' + key);
console.log('\nKeep this safe and back it up somewhere separate from your server.');
console.log('If you ever lose it, any data encrypted with it becomes permanently unreadable —');
console.log('there is no way to recover it, by design, not even by regenerating a new key.\n');
