const express    = require('express');
const bodyParser = require('body-parser');
const Database   = require('better-sqlite3');
const path       = require('path');
const fs         = require('fs');

const app  = express();
const PORT = 3000;

// ── Open (or create) the SQLite database ─────────────────────────────────────
const DB_PATH = path.join(__dirname, 'ospectra.db');
const db      = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

// ── Create users table ────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    age        TEXT,
    name       TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ── One-time migration: users.json → SQLite ───────────────────────────────────
const USERS_JSON = path.join(__dirname, 'users.json');
if (fs.existsSync(USERS_JSON)) {
  try {
    const jsonUsers = JSON.parse(fs.readFileSync(USERS_JSON, 'utf8'));
    const insert = db.prepare(`
      INSERT OR IGNORE INTO users (username, password, age, name)
      VALUES (@username, @password, @age, @name)
    `);
    const importMany = db.transaction((users) => {
      for (const u of users) {
        insert.run({
          username: u.username,
          password: u.password,
          age:      u.age  || null,
          name:     u.name || null,
        });
      }
    });
    importMany(jsonUsers);
    console.log(`[db] Migrated ${jsonUsers.length} user(s) from users.json → ospectra.db`);
    fs.renameSync(USERS_JSON, USERS_JSON + '.migrated');
    console.log('[db] users.json renamed to users.json.migrated');
  } catch (err) {
    console.warn('[db] Migration warning:', err.message);
  }
}

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtFindUser   = db.prepare('SELECT * FROM users WHERE username = ?');
const stmtInsertUser = db.prepare(`
  INSERT INTO users (username, password, age, name)
  VALUES (@username, @password, @age, @name)
`);

// ── Helper: display name from name field or email prefix ─────────────────────
function deriveDisplayName(user) {
  if (user.name && user.name.trim().length > 1) return user.name.trim();
  const prefix = (user.username || '').split('@')[0];
  return prefix
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// ── POST /api/login ───────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ success: false, message: 'Email and password are required.' });
  }

  const user = stmtFindUser.get(username);

  if (user && user.password === password) {
    return res.json({
      success:  true,
      message:  'Login successful',
      username: user.username,
      name:     deriveDisplayName(user),
      email:    user.username,
      age:      user.age,
    });
  }

  res.json({ success: false, message: 'User not found or wrong password.' });
});

// ── POST /api/signup ──────────────────────────────────────────────────────────
app.post('/api/signup', (req, res) => {
  const { username, password, age, name } = req.body;

  if (!username || !password) {
    return res.json({ success: false, message: 'Email and password are required.' });
  }

  const existing = stmtFindUser.get(username);
  if (existing) {
    return res.json({ success: false, message: 'User already exists.' });
  }

  try {
    stmtInsertUser.run({
      username,
      password,
      age:  age  || null,
      name: name ? name.trim() : null,
    });

    const newUser = stmtFindUser.get(username);
    return res.json({
      success:  true,
      message:  'Sign up successful',
      username: newUser.username,
      name:     deriveDisplayName(newUser),
      email:    newUser.username,
      age:      newUser.age,
    });
  } catch (err) {
    console.error('[signup] error:', err.message);
    return res.json({ success: false, message: 'Signup failed. Please try again.' });
  }
});

// ── GET /api/users (debug — remove in production) ────────────────────────────
app.get('/api/users', (req, res) => {
  const users = db.prepare(
    'SELECT id, username, age, name, created_at FROM users'
  ).all();
  res.json(users);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});