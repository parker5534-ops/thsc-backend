const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const crypto = require('crypto');

// POST — track an event from the public site
router.post('/event', (req, res) => {
  const { event_type, page, meta, session_id } = req.body;

  if (!event_type) return res.status(400).json({ error: 'event_type is required' });

  // Hash the IP so we don't store PII
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';
  const ip_hash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);

  try {
    db.prepare(`
      INSERT INTO analytics (event_type, page, meta, session_id, ip_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(event_type, page || null, meta ? JSON.stringify(meta) : null, session_id || null, ip_hash);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record event' });
  }
});

// GET summary stats
router.get('/summary', requireAdmin, (req, res) => {
  const { days = 30 } = req.query;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const pageViews = db.prepare(`
    SELECT COUNT(*) as count FROM analytics
    WHERE event_type = 'page_view' AND created_at > ?
  `).get(since);

  const uniqueVisitors = db.prepare(`
    SELECT COUNT(DISTINCT ip_hash) as count FROM analytics
    WHERE event_type = 'page_view' AND created_at > ?
  `).get(since);

  const ctaClicks = db.prepare(`
    SELECT meta, COUNT(*) as count FROM analytics
    WHERE event_type = 'cta_click' AND created_at > ?
    GROUP BY meta ORDER BY count DESC
  `).all(since);

  const formSubmissions = db.prepare(`
    SELECT form_type, COUNT(*) as count FROM submissions
    WHERE submitted_at > ? GROUP BY form_type
  `).all(since);

  const scrollDepth = db.prepare(`
    SELECT meta, COUNT(*) as count FROM analytics
    WHERE event_type = 'section_view' AND created_at > ?
    GROUP BY meta ORDER BY count DESC
  `).all(since);

  const referrers = db.prepare(`
    SELECT meta, COUNT(*) as count FROM analytics
    WHERE event_type = 'page_view' AND meta IS NOT NULL AND created_at > ?
    GROUP BY meta ORDER BY count DESC LIMIT 10
  `).all(since);

  res.json({
    page_views:      pageViews.count,
    unique_visitors: uniqueVisitors.count,
    cta_clicks:      ctaClicks,
    form_submissions: formSubmissions,
    scroll_depth:    scrollDepth,
    referrers:       referrers,
  });
});

module.exports = router;
