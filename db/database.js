const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'thsc.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS team (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id    TEXT NOT NULL UNIQUE,
      username      TEXT NOT NULL,
      display_name  TEXT,
      avatar        TEXT,
      role          TEXT NOT NULL DEFAULT 'moderator',
      added_by      TEXT,
      added_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login    DATETIME
    );

    CREATE TABLE IF NOT EXISTS content (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      form_type     TEXT NOT NULL,
      data          TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'new',
      submitted_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_by   TEXT,
      reviewed_at   DATETIME,
      notes         TEXT
    );

    CREATE TABLE IF NOT EXISTS analytics (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      page       TEXT,
      meta       TEXT,
      session_id TEXT,
      ip_hash    TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  seedDefaultContent();
  seedDefaultSettings();
  console.log('[DB] Migrations complete');
}

function seedDefaultContent() {
  const defaults = {
    hero_eyebrow:     "Houston's Premier Gaming Community",
    hero_title:       "T!H$C",
    hero_subtitle:    "The Houston Clutchers",
    hero_tagline:     "More than a Discord server. A space built for gamers who actually connect — squad up, hang out, and find your people.",
    hero_cta1_text:   "Join Discord",
    hero_cta2_text:   "Explore the Community →",
    hero_stat1_val:   "2020",   hero_stat1_label: "Founded",
    hero_stat2_val:   "Active", hero_stat2_label: "Community",
    hero_stat3_val:   "24/7",   hero_stat3_label: "Voice Chats",
    hero_stat4_val:   "HTX",    hero_stat4_label: "Roots",

    about_label:   "About the Community",
    about_heading1:"Gaming-first.",
    about_heading2:"Community always.",
    about_sub:     "T!H$C started as a squad. It grew into something more — a place where you actually want to log on, not just to game, but to talk, vibe, and connect with people who get it.",
    about_body:    "Built in Houston, expanded to Discord in 2024. We focus on real community — not just a list of channels with nobody in them. Every space in T!H$C has a purpose, and every member has a place.",
    about_pills:   "Gaming\nCommunity\nHouston Roots\nLifestyle\nOrganized\nPremium Feel\nWelcoming",

    features_label:   "What's Inside",
    features_heading: "Built different. On purpose.",
    features_sub:     "Every channel, every role, every voice room was set up with a reason. No dead spaces, no clutter.",
    features_cards: JSON.stringify([
      { icon:"🎮", title:"Game-Specific Channels",  desc:"Dedicated spaces for the titles you actually play. Talk strats, find teammates, share clips — all in the right room." },
      { icon:"🏷️", title:"Role-Based Access",        desc:"Pick your roles, unlock your channels. The server adapts to you — not the other way around." },
      { icon:"💬", title:"General Chat & Hangout",   desc:"Chill conversation, memes, life updates — the social core of the server. Always something going on." },
      { icon:"🎙️", title:"Always-On Voice Chats",    desc:"Permanent lounges for when you just want to hang. Drop in, don't even have to talk — just vibe." },
      { icon:"⚡",  title:"Squad-Up Rooms",            desc:"Temporary voice channels created on demand when you're ready to run games. No waste, just play." },
      { icon:"📈", title:"Progression & Leveling",   desc:"Stay active, level up, unlock perks. The more you engage, the more the server gives back." },
      { icon:"🏗️", title:"Organized Structure",      desc:"Sections that make sense. You'll never wonder where to post or who to talk to." },
      { icon:"🌙", title:"Late-Night Culture",        desc:"Active when other servers are dead. We run when the night does — this is a real community, not 9-to-5." },
      { icon:"🤝", title:"Community Events",          desc:"Tournaments, game nights, challenges — regular reasons to show up and compete together." },
    ]),

    faq_label:   "FAQ",
    faq_heading: "Questions answered. Before you even ask.",
    faq_items: JSON.stringify([
      { q:"Is T!H$C open to everyone?",                a:"Yes — T!H$C is open to anyone who respects the community and wants to be part of something real. You don't have to be from Houston." },
      { q:"What games are played here?",               a:"The server covers a wide range — from Valorant and Warzone to NBA 2K and Fortnite, with more being added based on what the community actually plays." },
      { q:"Do I have to be a hardcore gamer to join?", a:"Not at all. Gaming is the focus, but the server is also about community and lifestyle. Casual players are all welcome." },
      { q:"How active is the server?",                 a:"T!H$C is an active, growing community. You'll find people in general chat and voice throughout the day — especially evenings and late nights." },
      { q:"Is there staff or moderation?",             a:"Yes. The server is led by the four founders and has a moderation team in place. The goal is a light hand with a clear set of standards." },
      { q:"What happens after I join?",                a:"You'll land in the welcome area, go through a quick verification, and then get to pick your roles to unlock the channels that fit you." },
    ]),

    cta_label:    "Ready to Join?",
    cta_heading:  "Your squad is already in here.",
    cta_desc:     "Stop lurking. Stop looking for a Discord worth being in. This is it. Come as you are, and find your people.",
    cta_btn1_text:"Join the Server",
    cta_btn2_text:"Vote on Top.gg ↑",
    cta_btn3_text:"Learn More →",

    nav_cta_text: "Join Discord",
    footer_copy:  "© 2025 T!H$C — The Houston Clutchers. All rights reserved.",
  };

  const insert = db.prepare('INSERT OR IGNORE INTO content (key, value) VALUES (?, ?)');
  const insertMany = db.transaction((items) => {
    for (const [k, v] of Object.entries(items)) insert.run(k, v);
  });
  insertMany(defaults);
}

function seedDefaultSettings() {
  const defaults = {
    discord_invite:        "https://discord.gg/SVunWsfj76",
    topgg_server_id:       "784147911148965888",
    tiktok_url:            "https://www.tiktok.com/@thehoustonclutchers",
    accent_color:          "#7c5cbf",
    accent_light:          "#9b7fd4",
    show_topgg_widget:     "true",
    show_member_count:     "false",
    show_discord_widget:   "false",
    discord_webhook_url:   "",
    webhook_enabled:       "false",
    section_order:         JSON.stringify(["hero","about","features","how","experience","why","rules","faq","cta"]),
    sections_disabled:     JSON.stringify([]),
  };

  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const insertMany = db.transaction((items) => {
    for (const [k, v] of Object.entries(items)) insert.run(k, v);
  });
  insertMany(defaults);
}

migrate();
module.exports = db;
