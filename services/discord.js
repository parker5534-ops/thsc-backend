/**
 * services/discord.js
 *
 * All Discord REST API calls go through this module.
 * Uses BlazeBot's token (DISCORD_BOT_TOKEN) to authenticate.
 * Responses are cached for 10 minutes to avoid rate limiting.
 *
 * Discord API v10 docs: https://discord.com/developers/docs/reference
 */

const fetch = require('node-fetch');

const BASE = 'https://discord.com/api/v10';

// ── Simple in-memory cache ────────────────────────────────
// Key: endpoint string  Value: { data, expires }
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { cache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

// ── Config validation ─────────────────────────────────────
function getConfig() {
  const token   = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token)   throw new ConfigError('DISCORD_BOT_TOKEN is not set in environment variables.');
  if (!guildId) throw new ConfigError('DISCORD_GUILD_ID is not set in environment variables.');

  return { token, guildId };
}

// Custom error classes for clean error handling in routes
class ConfigError extends Error {
  constructor(msg) { super(msg); this.name = 'ConfigError'; this.status = 503; }
}

class DiscordAPIError extends Error {
  constructor(msg, status) { super(msg); this.name = 'DiscordAPIError'; this.status = status || 502; }
}

// ── Core fetch wrapper ────────────────────────────────────
async function discordFetch(endpoint, token, useCache = true) {
  const cacheKey = endpoint;

  if (useCache) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }

  const res = await fetch(`${BASE}${endpoint}`, {
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 401) throw new DiscordAPIError('Invalid bot token — check DISCORD_BOT_TOKEN.', 401);
  if (res.status === 403) throw new DiscordAPIError('Bot does not have permission to access this resource. Check bot permissions and Server Members Intent.', 403);
  if (res.status === 404) throw new DiscordAPIError('Guild not found — check DISCORD_GUILD_ID and make sure BlazeBot is in the server.', 404);
  if (res.status === 429) throw new DiscordAPIError('Discord rate limit hit — try again in a moment.', 429);

  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch (_) {}
    throw new DiscordAPIError(`Discord API error ${res.status}: ${body}`, res.status);
  }

  const data = await res.json();
  if (useCache) setCache(cacheKey, data);
  return data;
}

// ── Public API ────────────────────────────────────────────

/**
 * Fetch guild/server info.
 * Returns: name, icon, description, member counts, etc.
 * Requires: bot in guild, no special intents needed.
 */
async function getGuild() {
  const { token, guildId } = getConfig();
  // with_counts=true gives approximate_member_count and approximate_presence_count
  return discordFetch(`/guilds/${guildId}?with_counts=true`, token);
}

/**
 * Fetch guild channels.
 * Returns array of channel objects.
 * Requires: bot in guild, VIEW_CHANNEL permission.
 */
async function getChannels() {
  const { token, guildId } = getConfig();
  return discordFetch(`/guilds/${guildId}/channels`, token);
}

/**
 * Fetch guild roles.
 * Returns array of role objects.
 * Requires: bot in guild.
 */
async function getRoles() {
  const { token, guildId } = getConfig();
  return discordFetch(`/guilds/${guildId}/roles`, token);
}

/**
 * Fetch guild members (paginated, max 1000 per call).
 * Requires: Server Members Intent enabled in Discord Developer Portal.
 * Without the intent, Discord returns 403.
 *
 * @param {number} limit - 1 to 1000
 * @param {string} after - snowflake ID to paginate after
 */
async function getMembers(limit = 100, after = '0') {
  const { token, guildId } = getConfig();
  // Members endpoint is sensitive — shorter cache TTL
  const endpoint = `/guilds/${guildId}/members?limit=${limit}&after=${after}`;
  const cacheKey = endpoint;

  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${BASE}${endpoint}`, {
    headers: { Authorization: `Bot ${token}` },
  });

  if (res.status === 401) throw new DiscordAPIError('Invalid bot token.', 401);
  if (res.status === 403) throw new DiscordAPIError(
    'Cannot list members. Enable "Server Members Intent" in the Discord Developer Portal under your bot\'s settings.',
    403
  );
  if (res.status === 404) throw new DiscordAPIError('Guild not found — check DISCORD_GUILD_ID.', 404);
  if (!res.ok) throw new DiscordAPIError(`Discord API error ${res.status}`, res.status);

  const data = await res.json();
  setCache(cacheKey, data);
  return data;
}

/**
 * Build a dashboard-friendly summary from guild data.
 * Separates live Discord stats from stored analytics clearly.
 */
async function getSummary() {
  const { token, guildId } = getConfig();

  const guild = await getGuild();
  const [channels, roles] = await Promise.all([getChannels(), getRoles()]);

  // Channel type counts
  // 0 = text, 2 = voice, 4 = category, 5 = announcement, 13 = stage, 15 = forum
  const textChannels  = channels.filter(c => [0, 5, 15].includes(c.type));
  const voiceChannels = channels.filter(c => [2, 13].includes(c.type));

  // Filter out @everyone role from display
  const publicRoles = roles.filter(r => r.name !== '@everyone');

  // Build icon URL
  const iconUrl = guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${guild.icon.startsWith('a_') ? 'gif' : 'png'}?size=256`
    : null;

  return {
    // ── Live Discord data ──────────────────────
    bot_connected:       true,
    guild_id:            guild.id,
    guild_name:          guild.name,
    guild_icon:          iconUrl,
    guild_description:   guild.description || null,
    guild_vanity:        guild.vanity_url_code || null,
    member_count:        guild.approximate_member_count ?? guild.member_count ?? null,
    online_count:        guild.approximate_presence_count ?? null,
    total_channels:      channels.length,
    text_channels:       textChannels.length,
    voice_channels:      voiceChannels.length,
    total_roles:         publicRoles.length,
    boost_level:         guild.premium_tier,
    boost_count:         guild.premium_subscription_count ?? 0,
    // ── Metadata ──────────────────────────────
    fetched_at:          new Date().toISOString(),
    // ── Note for frontend ─────────────────────
    // Historical analytics (page views, CTA clicks) are separate
    // and come from /api/analytics/summary — NOT from Discord.
  };
}

// ── Error handler for routes ──────────────────────────────
/**
 * Wraps a Discord service call and returns a clean error response.
 * Use in routes: const result = await discordSafe(res, () => getSummary());
 */
async function discordSafe(res, fn) {
  try {
    const data = await fn();
    return res.json(data);
  } catch (err) {
    const status  = err.status || 500;
    const name    = err.name   || 'Error';
    const message = err.message;

    console.error(`[Discord] ${name}: ${message}`);

    // Return structured error so frontend can handle it gracefully
    return res.status(status).json({
      error:       true,
      error_type:  name,
      message,
      // Actionable hint based on error type
      hint: getHint(name, status),
    });
  }
}

function getHint(name, status) {
  if (name === 'ConfigError')       return 'Add DISCORD_BOT_TOKEN and DISCORD_GUILD_ID to your environment variables.';
  if (status === 401)               return 'Reset your bot token in the Discord Developer Portal and update DISCORD_BOT_TOKEN.';
  if (status === 403)               return 'Enable "Server Members Intent" and "Presence Intent" in your bot settings at discord.com/developers/applications.';
  if (status === 404)               return 'Make sure BlazeBot is in your Discord server and DISCORD_GUILD_ID is correct.';
  if (status === 429)               return 'You are being rate limited by Discord. Wait 60 seconds and try again.';
  return 'Check your bot token, guild ID, and bot permissions.';
}

module.exports = { getGuild, getChannels, getRoles, getMembers, getSummary, discordSafe };
