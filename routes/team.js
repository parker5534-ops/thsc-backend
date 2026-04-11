const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAdmin, requireOwner } = require('../middleware/auth');
const fetch = require('node-fetch');

const ROLES = ['moderator', 'admin', 'owner'];

// GET all team members
router.get('/', requireAdmin, (req, res) => {
  const OWNER_ID = process.env.OWNER_DISCORD_ID;
  const members = db.prepare('SELECT * FROM team ORDER BY added_at ASC').all();

  // Always ensure owner is in the list with correct role
  const ownerInList = members.find(m => m.discord_id === OWNER_ID);
  if (!ownerInList) {
    members.unshift({
      discord_id:   OWNER_ID,
      username:     'Owner',
      display_name: 'Owner',
      avatar:       null,
      role:         'owner',
      added_at:     new Date().toISOString(),
    });
  }

  // Attach avatar URLs
  const formatted = members.map(m => ({
    ...m,
    avatar_url: m.avatar
      ? `https://cdn.discordapp.com/avatars/${m.discord_id}/${m.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/0.png`,
    is_owner: m.discord_id === OWNER_ID,
  }));

  res.json(formatted);
});

// POST — add a team member by Discord ID
// Looks up their Discord profile via the bot token or just stores the ID
router.post('/', requireAdmin, async (req, res) => {
  const { discord_id, role } = req.body;

  if (!discord_id) return res.status(400).json({ error: 'discord_id is required' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });

  // Can't add another owner unless you are the owner
  if (role === 'owner' && req.user.discord_id !== process.env.OWNER_DISCORD_ID) {
    return res.status(403).json({ error: 'Only the owner can assign owner role' });
  }

  // Check if already exists
  const existing = db.prepare('SELECT * FROM team WHERE discord_id = ?').get(discord_id);
  if (existing) {
    return res.status(409).json({ error: 'This Discord user is already on the team' });
  }

  // Try to fetch their Discord profile
  let username = discord_id;
  let display_name = discord_id;
  let avatar = null;

  try {
    const resp = await fetch(`https://discord.com/api/v10/users/${discord_id}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }
    });
    if (resp.ok) {
      const data = await resp.json();
      username     = data.username;
      display_name = data.global_name || data.username;
      avatar       = data.avatar;
    }
  } catch (e) {
    // Bot token not set or error — that's okay, we still add them
    console.warn('[Team] Could not fetch Discord profile:', e.message);
  }

  try {
    db.prepare(`
      INSERT INTO team (discord_id, username, display_name, avatar, role, added_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(discord_id, username, display_name, avatar, role, req.user.discord_id);

    res.json({
      ok: true,
      member: { discord_id, username, display_name, role }
    });
  } catch (err) {
    console.error('[Team] Add error:', err);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

// PATCH — update a member's role
router.patch('/:discord_id', requireAdmin, (req, res) => {
  const { discord_id } = req.params;
  const { role } = req.body;
  const OWNER_ID = process.env.OWNER_DISCORD_ID;

  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });
  }

  // Can't change the owner's role
  if (discord_id === OWNER_ID) {
    return res.status(403).json({ error: "Cannot change the owner's role" });
  }

  // Only the owner can grant owner role
  if (role === 'owner' && req.user.discord_id !== OWNER_ID) {
    return res.status(403).json({ error: 'Only the owner can assign owner role' });
  }

  const result = db.prepare('UPDATE team SET role = ? WHERE discord_id = ?').run(role, discord_id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Team member not found' });
  }

  res.json({ ok: true });
});

// DELETE — remove a team member
router.delete('/:discord_id', requireOwner, (req, res) => {
  const { discord_id } = req.params;
  const OWNER_ID = process.env.OWNER_DISCORD_ID;

  if (discord_id === OWNER_ID) {
    return res.status(403).json({ error: 'Cannot remove the owner' });
  }

  const result = db.prepare('DELETE FROM team WHERE discord_id = ?').run(discord_id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Team member not found' });
  }

  res.json({ ok: true });
});

module.exports = router;
