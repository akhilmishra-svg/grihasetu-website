const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Simple JSON file "database" (no native compilation needed) ----
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

const STATUS_STEPS = ['Lead Created', 'Documents Pending', 'Application Submitted', 'Credit Assessment', 'Sanction', 'Disbursement'];

// ---- AUTH ----
app.post('/api/register', (req, res) => {
  const { name, mobile, email, city, userType, password } = req.body;
  if (!name || !mobile || !password) {
    return res.status(400).json({ error: 'Name, mobile and password are required.' });
  }
  const data = readDB();
  const existing = data.users.find(u => u.mobile === mobile);
  if (existing) return res.status(409).json({ error: 'An account with this mobile number already exists. Please login.' });

  const hash = bcrypt.hashSync(password, 10);
  const user = {
    id: data.nextUserId++,
    name, mobile, email: email || '', city: city || '',
    userType: userType || 'customer', password: hash,
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  writeDB(data);

  res.json({ id: user.id, name: user.name, mobile: user.mobile, userType: user.userType });
});

app.post('/api/login', (req, res) => {
  const { mobile, password } = req.body;
  const data = readDB();
  const user = data.users.find(u => u.mobile === mobile);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Incorrect mobile number or password.' });
  }
  res.json({ id: user.id, name: user.name, mobile: user.mobile, userType: user.userType });
});

// ---- LOAN APPLICATIONS ----
app.post('/api/applications', (req, res) => {
  const { userId, applicantName, mobile, employment, income, existingEmi, propertyLocation, propertyValue, loanAmount, loanType, callbackTime } = req.body;
  if (!userId || !applicantName || !mobile) {
    return res.status(400).json({ error: 'Required fields are missing.' });
  }
  const data = readDB();
  const application = {
    id: data.nextAppId++,
    userId, applicantName, mobile, employment, income, existingEmi,
    propertyLocation, propertyValue, loanAmount, loanType, callbackTime,
    status: STATUS_STEPS[0],
    createdAt: new Date().toISOString(),
  };
  data.applications.push(application);
  writeDB(data);

  res.json({ id: application.id, status: application.status });
});

app.get('/api/applications/user/:userId', (req, res) => {
  const data = readDB();
  const userId = Number(req.params.userId);
  const rows = data.applications
    .filter(a => a.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(rows);
});

app.get('/api/applications', (req, res) => {
  const data = readDB();
  const rows = data.applications
    .map(a => {
      const user = data.users.find(u => u.id === a.userId);
      return { ...a, userName: user ? user.name : 'Unknown', userMobile: user ? user.mobile : '' };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(rows);
});

app.post('/api/applications/:id/status', (req, res) => {
  const { status } = req.body;
  if (!STATUS_STEPS.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const data = readDB();
  const id = Number(req.params.id);
  const app_ = data.applications.find(a => a.id === id);
  if (!app_) return res.status(404).json({ error: 'Application not found' });
  app_.status = status;
  writeDB(data);
  res.json({ ok: true });
});

app.get('/api/status-steps', (req, res) => res.json(STATUS_STEPS));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GrihaSetu server running on http://localhost:${PORT}`));
