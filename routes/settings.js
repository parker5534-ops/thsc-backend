const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// GET all settings
router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

// POST — update settings
router.post('/', requireAdmin, (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Body must be a JSON object' });
  }

  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value      = excluded.value,
      updated_at = excluded.updated_at
  `);

  const updateMany = db.transaction((items) => {
    for (const [k, v] of Object.entries(items)) upsert.run(k, String(v));
  });

  try {
    updateMany(updates);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Settings] Save error:', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

module.exports = router;
