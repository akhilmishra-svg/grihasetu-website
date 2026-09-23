require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Email (OTP) setup ----
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
let transporter = null;
if (EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    family: 4, // force IPv4 — some hosts (like Render) fail to reach Gmail over IPv6
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
} else {
  console.warn('EMAIL_USER / EMAIL_PASS not set — OTP emails will not be sent. See README for setup.');
}

// In-memory OTP store: { email: { otp, expiresAt, verified } }
const otpStore = {};
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ---- File upload setup (documents stored outside /public so they aren't publicly browsable) ----
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only PDF, JPG and PNG files are allowed.'));
  },
});

// ---- Simple JSON file "database" (no native compilation needed) ----
const DB_FILE = path.join(__dirname, 'griha-db.json');

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    return { users: [], applications: [], documents: [], nextUserId: 1, nextAppId: 1, nextDocId: 1 };
  }
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  if (!data.documents) data.documents = [];
  if (!data.nextDocId) data.nextDocId = 1;
  return data;
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const STATUS_STEPS = ['Lead Created', 'Documents Pending', 'Application Submitted', 'Credit Assessment', 'Sanction', 'Disbursement'];

// ---- EMAIL OTP ----
app.post('/api/otp/send', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!transporter) return res.status(500).json({ error: 'Email service is not configured on the server yet.' });

  const otp = generateOtp();
  otpStore[email] = { otp, expiresAt: Date.now() + 10 * 60 * 1000, verified: false };

  try {
    await transporter.sendMail({
      from: `"GrihaSetu" <${EMAIL_USER}>`,
      to: email,
      subject: 'Your GrihaSetu verification code',
      html: `<p>Your OTP for GrihaSetu registration is:</p><h2 style="letter-spacing:4px;">${otp}</h2><p>This code expires in 10 minutes.</p>`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Email send failed:', err.message);
    res.status(500).json({ error: 'Could not send OTP email. Please try again.' });
  }
});

app.post('/api/otp/verify', (req, res) => {
  const { email, otp } = req.body;
  const record = otpStore[email];
  if (!record) return res.status(400).json({ error: 'Please request an OTP first.' });
  if (Date.now() > record.expiresAt) return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  if (record.otp !== otp) return res.status(400).json({ error: 'Incorrect OTP.' });

  record.verified = true;
  res.json({ ok: true });
});

// ---- AUTH ----
app.post('/api/register', (req, res) => {
  const { name, mobile, email, city, userType, password } = req.body;
  if (!name || !mobile || !password) {
    return res.status(400).json({ error: 'Name, mobile and password are required.' });
  }
  if (!email || !otpStore[email] || !otpStore[email].verified) {
    return res.status(400).json({ error: 'Please verify your email with the OTP before creating an account.' });
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
  delete otpStore[email]; // OTP used, clean it up

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

// ---- DOCUMENTS ----
const DOC_TYPES = ['PAN Card', 'Aadhaar / KYC', 'Salary Slips', 'Bank Statements', 'ITR / Business Documents', 'Property Documents'];
app.get('/api/document-types', (req, res) => res.json(DOC_TYPES));

app.post('/api/documents/upload', upload.single('file'), (req, res) => {
  const { applicationId, docType } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file was uploaded.' });
  if (!applicationId || !docType) return res.status(400).json({ error: 'Application and document type are required.' });

  const data = readDB();
  const doc = {
    id: data.nextDocId++,
    applicationId: Number(applicationId),
    docType,
    originalName: req.file.originalname,
    storedName: req.file.filename,
    size: req.file.size,
    status: 'Uploaded',
    uploadedAt: new Date().toISOString(),
  };
  data.documents.push(doc);
  writeDB(data);
  res.json(doc);
});

app.get('/api/documents/application/:appId', (req, res) => {
  const data = readDB();
  const appId = Number(req.params.appId);
  const docs = data.documents.filter(d => d.applicationId === appId);
  res.json(docs);
});

app.get('/api/documents/file/:id', (req, res) => {
  const data = readDB();
  const doc = data.documents.find(d => d.id === Number(req.params.id));
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  const filePath = path.join(UPLOADS_DIR, doc.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on server.' });
  res.sendFile(filePath);
});

app.post('/api/documents/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['Uploaded', 'Pending', 'Rejected', 'Approved'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const data = readDB();
  const doc = data.documents.find(d => d.id === Number(req.params.id));
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  doc.status = status;
  writeDB(data);
  res.json({ ok: true });
});

app.delete('/api/documents/:id', (req, res) => {
  const data = readDB();
  const doc = data.documents.find(d => d.id === Number(req.params.id));
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  const filePath = path.join(UPLOADS_DIR, doc.storedName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  data.documents = data.documents.filter(d => d.id !== doc.id);
  writeDB(data);
  res.json({ ok: true });
});

// Multer error handler (file too large, wrong type, etc.)
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
  next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GrihaSetu server running on http://localhost:${PORT}`));
