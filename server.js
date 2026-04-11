require('dotenv').config();
const express   = require('express');
const session   = require('express-session');
const passport  = require('passport');
const Strategy  = require('passport-discord').Strategy;
const cors      = require('cors');
const path      = require('path');
const db        = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ── CORS ────────────────────────────────────────────────
// Allow requests from your Netlify site and localhost
app.use(cors({
  origin: [
    process.env.PUBLIC_SITE_URL,
    'http://localhost:3000',
    'http://localhost:5500',
  ],
  credentials: true,
}));

// ── BODY PARSING ────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── SESSIONS ────────────────────────────────────────────
// On Render free tier the filesystem resets on deploy,
// so sessions in SQLite will be wiped — that's fine,
// users just log in again. Upgrade to Render's persistent
// disk or Redis for sticky sessions in production.
app.use(session({
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  }
}));

// ── PASSPORT / DISCORD OAUTH ─────────────────────────────
passport.use(new Strategy({
  clientID:     process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL:  process.env.DISCORD_CALLBACK_URL,
  scope:        ['identify'],
}, (accessToken, refreshToken, profile, done) => {
  // profile.id is their Discord user ID
  return done(null, {
    discord_id:  profile.id,
    username:    profile.username,
    global_name: profile.global_name,
    avatar:      profile.avatar,
  });
}));

passport.serializeUser((user, done)   => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.use(passport.initialize());
app.use(passport.session());

// ── TRUST PROXY (needed on Render for secure cookies) ───
app.set('trust proxy', 1);

// ── STATIC — serve the admin dashboard ──────────────────
app.use('/admin', express.static(path.join(__dirname, 'public')));

// ── ROUTES ──────────────────────────────────────────────
app.use('/auth',            require('./routes/auth'));
app.use('/api/content',     require('./routes/content'));
app.use('/api/settings',    require('./routes/settings'));
app.use('/api/team',        require('./routes/team'));
app.use('/api/submissions', require('./routes/submissions'));
app.use('/api/analytics',   require('./routes/analytics'));

// ── HEALTH CHECK ─────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ── CATCH-ALL — redirect unknown routes to admin ─────────
app.get('*', (req, res) => {
  res.redirect('/admin');
});

// ── START ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[THSC] Server running on port ${PORT}`);
  console.log(`[THSC] Environment: ${process.env.NODE_ENV || 'development'}`);
});
