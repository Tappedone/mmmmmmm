// Usage: node hash-password.js "YourStrongPassword123"
// Copy the printed hash into your .env file as ADMIN_PASSWORD_HASH
const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.log('Usage: node hash-password.js "YourStrongPassword"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log('\nAdd this to your .env file:\n');
console.log('ADMIN_PASSWORD_HASH=' + hash);
console.log('');
