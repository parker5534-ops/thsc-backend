const express = require('express');
const router = express.Router();

const {
  getGuild,
  getChannels,
  getRoles,
  getMembers,
  getSummary,
  discordSafe
} = require('../services/discord');

// GET /api/discord/summary
router.get('/summary', (req, res) => {
  return discordSafe(res, getSummary);
});

// GET /api/discord/channels
router.get('/channels', (req, res) => {
  return discordSafe(res, getChannels);
});

// GET /api/discord/roles
router.get('/roles', (req, res) => {
  return discordSafe(res, getRoles);
});

// GET /api/discord/members
router.get('/members', (req, res) => {
  return discordSafe(res, getMembers);
});

module.exports = router;