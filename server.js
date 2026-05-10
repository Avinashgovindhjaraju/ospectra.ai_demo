const express    = require('express');
const bodyParser = require('body-parser');
const fs         = require('fs');
const path       = require('path');

const app  = express();
const PORT = 3000;

// ── CORS (for local dev) ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

const USERS_FILE = path.join(__dirname, 'users.json');

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ── Helper: derive a display name from email or name field ───────────────────
// "avinash.govindharaju@ospectra.ai" → "Avinash Govindharaju"
function deriveDisplayName(user) {
  // If they filled in a real name during signup, use that
  if (user.name && user.name.trim().length > 1) return user.name.trim();
  // Fall back to email prefix, clean it up
  const prefix = (user.username || '').split('@')[0];           // "avinash.govindharaju"
  return prefix
    .replace(/[._-]+/g, ' ')                                    // "avinash govindharaju"
    .replace(/\b\w/g, c => c.toUpperCase())                     // "Avinash Govindharaju"
    .trim();
}

// ── POST /api/login ───────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();
  const user  = users.find(u => u.username === username && u.password === password);

  if (user) {
    // ✅ Return full profile so the frontend can pass it to ospTrack
    res.json({
      success:      true,
      message:      'Login successful',
      username:     user.username,          // email used as username
      name:         deriveDisplayName(user),// human-readable name
      email:        user.username,          // explicit email field
      age:          user.age,
      company:      user.company  || null,  // if you add company to users.json later
      phone:        user.phone    || null,
    });
  } else {
    res.json({ success: false, message: 'User not found or wrong password' });
  }
});

// ── POST /api/signup ──────────────────────────────────────────────────────────
app.post('/api/signup', (req, res) => {
  const { username, password, age, name, company, phone } = req.body;
  let users = readUsers();

  if (users.find(u => u.username === username)) {
    return res.json({ success: false, message: 'User already exists' });
  }

  // ✅ Store extra fields if provided (name, company, phone)
  const newUser = { username, password, age };
  if (name)    newUser.name    = name.trim();
  if (company) newUser.company = company.trim();
  if (phone)   newUser.phone   = phone.trim();

  users.push(newUser);
  writeUsers(users);

  res.json({
    success:  true,
    message:  'Sign up successful',
    username: username,
    name:     deriveDisplayName(newUser),
    email:    username,
    age:      age,
    company:  newUser.company || null,
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});