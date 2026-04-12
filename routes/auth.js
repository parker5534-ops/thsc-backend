const express = require('express');
const passport = require('passport');
const router = express.Router();
const db = require('../db/database');

// Kick off Discord OAuth
router.get('/discord', passport.authenticate('discord'));

// Discord redirects here after user approves
router.get('/discord/callback', (req, res, next) => {
  console.log('DISCORD CALLBACK HIT');
  console.log('Query keys:', Object.keys(req.query || {}));
  console.log('Has code:', !!req.query.code);
  console.log('Has error:', !!req.query.error);
  console.log('Query error:', req.query.error || null);

  passport.authenticate('discord', (err, user, info) => {
    if (err) {
      console.error('PASSPORT AUTH ERROR:', err);
      console.error('PASSPORT AUTH ERROR DATA:', err.oauthError?.data || null);
      console.error('PASSPORT AUTH STATUS:', err.oauthError?.statusCode || null);

      return res.status(500).json({
        ok: false,
        stage: 'passport-authenticate',
        error: err.message,
        oauthData: err.oauthError?.data || null,
        statusCode: err.oauthError?.statusCode || null
      });
    }

    if (!user) {
      console.error('NO USER RETURNED:', info);
      return res.status(401).json({
        ok: false,
        stage: 'no-user',
        info: info || null
      });
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('LOGIN ERROR:', loginErr);
        return res.status(500).json({
          ok: false,
          stage: 'req.logIn',
          error: loginErr.message
        });
      }

      const OWNER_ID = process.env.OWNER_DISCORD_ID;
      const member = db.prepare('SELECT * FROM team WHERE discord_id = ?').get(user.discord_id);

      if (user.discord_id !== OWNER_ID && !member) {
        req.logout(() => {});
        return res.redirect('/admin/login?error=unauthorized');
      }

      return res.redirect('/admin');
    });
  })(req, res, next);
});

// Current user info
router.get('/me', (req, res) => {
  if (!req.isAuthenticated()) return res.json({ authenticated: false });

  const OWNER_ID = process.env.OWNER_DISCORD_ID;
  const member = db.prepare('SELECT role FROM team WHERE discord_id = ?').get(req.user.discord_id);
  const role = req.user.discord_id === OWNER_ID ? 'owner' : (member?.role || 'moderator');

  res.json({
    authenticated: true,
    user: {
      discord_id:   req.user.discord_id,
      username:     req.user.username,
      display_name: req.user.global_name || req.user.username,
      avatar:       req.user.avatar
        ? `https://cdn.discordapp.com/avatars/${req.user.discord_id}/${req.user.avatar}.png`
        : null,
      role,
    }
  });
});

// Logout
router.post('/logout', (req, res) => {
  req.logout(() => {
    res.json({ ok: true });
  });
});

module.exports = router;
