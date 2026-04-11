const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const fetch = require('node-fetch');

const VALID_TYPES   = ['contact', 'staff', 'ban'];
const VALID_STATUSES = ['new', 'read', 'reviewed', 'approved', 'denied', 'archived'];

// GET submissions — filterable by type and status
router.get('/', requireAdmin, (req, res) => {
  const { type, status, limit = 50, offset = 0 } = req.query;

  let query  = 'SELECT * FROM submissions WHERE 1=1';
  const params = [];

  if (type   && VALID_TYPES.includes(type))     { query += ' AND form_type = ?'; params.push(type); }
  if (status && VALID_STATUSES.includes(status)) { query += ' AND status = ?';    params.push(status); }

  query += ' ORDER BY submitted_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const rows = db.prepare(query).all(...params);

  // Parse JSON data field
  const submissions = rows.map(r => ({
    ...r,
    data: JSON.parse(r.data)
  }));

  // Count unread per type
  const counts = db.prepare(`
    SELECT form_type, COUNT(*) as total,
           SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as unread
    FROM submissions GROUP BY form_type
  `).all();

  res.json({ submissions, counts });
});

// POST — receive a new form submission from the public site
router.post('/', (req, res) => {
  const { form_type, data } = req.body;

  if (!VALID_TYPES.includes(form_type)) {
    return res.status(400).json({ error: 'Invalid form_type' });
  }

  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'data must be an object' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO submissions (form_type, data) VALUES (?, ?)
    `).run(form_type, JSON.stringify(data));

    // Fire webhook if configured
    sendWebhook(form_type, data).catch(e => console.error('[Webhook]', e.message));

    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('[Submissions] Insert error:', err);
    res.status(500).json({ error: 'Failed to save submission' });
  }
});

// PATCH — update status or add notes
router.patch('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const result = db.prepare(`
    UPDATE submissions
    SET status      = COALESCE(?, status),
        notes       = COALESCE(?, notes),
        reviewed_by = ?,
        reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status || null, notes || null, req.user.discord_id, id);

  if (result.changes === 0) return res.status(404).json({ error: 'Submission not found' });
  res.json({ ok: true });
});

// DELETE — archive/delete a submission
router.delete('/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM submissions WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── WEBHOOK HELPER ──────────────────────────────────────
async function sendWebhook(formType, data) {
  const webhookUrl = db.prepare("SELECT value FROM settings WHERE key = 'discord_webhook_url'").get()?.value;
  const enabled    = db.prepare("SELECT value FROM settings WHERE key = 'webhook_enabled'").get()?.value;

  if (!webhookUrl || enabled !== 'true') return;

  const typeLabels = { contact: 'Contact Form', staff: 'Staff Application', ban: 'Ban Appeal' };
  const colors     = { contact: 0x7c5cbf, staff: 0x4ade80, ban: 0xf87171 };

  const fields = Object.entries(data).map(([k, v]) => ({
    name:   k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' '),
    value:  String(v).slice(0, 1024) || '—',
    inline: String(v).length < 60,
  }));

  const payload = {
    username:   'T!H$C Forms',
    avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
    embeds: [{
      title:       `📋 New ${typeLabels[formType] || formType}`,
      color:       colors[formType] || 0x7c5cbf,
      fields,
      footer:      { text: 'T!H$C Admin · ' + new Date().toLocaleString() },
    }]
  };

  const resp = await fetch(webhookUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!resp.ok) throw new Error(`Webhook returned ${resp.status}`);
}

module.exports = router;
