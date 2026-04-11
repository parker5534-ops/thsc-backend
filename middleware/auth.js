const db = require('../db/database');

// Must be logged in at all
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// Must be admin or owner
function requireAdmin(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = req.user;
  const OWNER_ID = process.env.OWNER_DISCORD_ID;

  if (user.discord_id === OWNER_ID) return next();

  const member = db.prepare('SELECT role FROM team WHERE discord_id = ?').get(user.discord_id);
  if (member && ['admin', 'owner'].includes(member.role)) return next();

  res.status(403).json({ error: 'Access denied — admin only' });
}

// Must be owner specifically
function requireOwner(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.user.discord_id === process.env.OWNER_DISCORD_ID) return next();

  const member = db.prepare('SELECT role FROM team WHERE discord_id = ?').get(req.user.discord_id);
  if (member && member.role === 'owner') return next();

  res.status(403).json({ error: 'Access denied — owner only' });
}

module.exports = { requireAuth, requireAdmin, requireOwner };
