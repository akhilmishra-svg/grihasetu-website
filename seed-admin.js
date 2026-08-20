const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'griha-db.json');

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    return { users: [], applications: [], nextUserId: 1, nextAppId: 1 };
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const mobile = '9999999999';
const password = 'admin123';

const data = readDB();
const existing = data.users.find(u => u.mobile === mobile);

if (!existing) {
  const hash = bcrypt.hashSync(password, 10);
  data.users.push({
    id: data.nextUserId++,
    name: 'Admin',
    mobile, email: '', city: '',
    userType: 'admin',
    password: hash,
    createdAt: new Date().toISOString(),
  });
  writeDB(data);
  console.log(`Admin created -> mobile: ${mobile}, password: ${password}`);
} else {
  console.log('Admin already exists.');
}
