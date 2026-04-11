const express = require('express');
const passport = require('passport');
const router = express.Router();
const db = require('../db/database');

// Kick off Discord OAuth
router.get('/discord', passport.authenticate('discord'));

// Discord redirects here after user approves
router.get('/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/admin/login?error=denied' }),
  (req, res) => {
    const user = req.user;

    // Check if this person is allowed in
    const OWNER_ID = process.env.OWNER_DISCORD_ID;
    const member = db.prepare('SELECT * FROM team WHERE discord_id = ?').get(user.discord_id);

    if (user.discord_id !== OWNER_ID && !member) {
      req.logout(() => {});
      return res.redirect('/admin/login?error=unauthorized');
    }

    // Update last login and avatar
    db.prepare(`
      INSERT INTO team (discord_id, username, display_name, avatar, role, added_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(discord_id) DO UPDATE SET
        username     = excluded.username,
        display_name = excluded.display_name,
        avatar       = excluded.avatar,
        last_login   = CURRENT_TIMESTAMP
    `).run(
      user.discord_id,
      user.username,
      user.global_name || user.username,
      user.avatar,
      user.discord_id === OWNER_ID ? 'owner' : (member?.role || 'moderator'),
      user.discord_id === OWNER_ID ? 'system' : (member?.added_by || 'system')
    );

    res.redirect('/admin');
  }
);

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
