const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// GET all content
router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM content').all();
  const content = {};
  rows.forEach(r => { content[r.key] = r.value; });
  res.json(content);
});

// POST — update one or many content fields
router.post('/', requireAdmin, (req, res) => {
  const updates = req.body; // { key: value, ... }
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Body must be a JSON object of key/value pairs' });
  }

  const upsert = db.prepare(`
    INSERT INTO content (key, value, updated_at, updated_by)
    VALUES (?, ?, CURRENT_TIMESTAMP, ?)
    ON CONFLICT(key) DO UPDATE SET
      value      = excluded.value,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `);

  const updateMany = db.transaction((items, userId) => {
    for (const [k, v] of Object.entries(items)) {
      upsert.run(k, String(v), userId);
    }
  });

  try {
    updateMany(updates, req.user.discord_id);
    res.json({ ok: true, updated: Object.keys(updates).length });
  } catch (err) {
    console.error('[Content] Save error:', err);
    res.status(500).json({ error: 'Failed to save content' });
  }
});

module.exports = router;
