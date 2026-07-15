const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-before-launch';

function cleanText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim();
}

function normalizeEmail(email) {
  return cleanText(email).toLowerCase();
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

function publicProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    handle: row.handle,
    profileType: row.profile_type,
    bio: row.bio,
    city: row.city,
    state: row.state,
    country: row.country,
    website: row.website,
    instagram: row.instagram,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function signUser(user) {
  return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
}

async function ensureAccountSchema() {
  if (!pool) return;
  await pool.query('create extension if not exists pgcrypto;');
  await pool.query(`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      email text unique not null,
      password_hash text not null,
      display_name text not null,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);
  await pool.query(`
    create table if not exists profiles (
      id uuid primary key default gen_random_uuid(),
      user_id uuid unique references users(id) on delete cascade,
      display_name text not null,
      handle text unique,
      profile_type text default 'explorer',
      bio text,
      city text,
      state text,
      country text default 'United States',
      website text,
      instagram text,
      image_url text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);
}

async function requireUser(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sign in required' });

    const payload = jwt.verify(token, JWT_SECRET);
    await ensureAccountSchema();
    const result = await pool.query('select * from users where id = $1 limit 1;', [payload.userId]);
    if (result.rowCount === 0) return res.status(401).json({ error: 'User not found' });

    req.user = result.rows[0];
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

router.post('/signup', async (req, res, next) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    await ensureAccountSchema();

    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const displayName = cleanText(req.body.displayName || req.body.display_name || req.body.name);

    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email is required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (!displayName) return res.status(400).json({ error: 'Display name is required' });

    const passwordHash = await bcrypt.hash(password, 12);
    const userResult = await pool.query(
      'insert into users (email, password_hash, display_name) values ($1,$2,$3) returning *;',
      [email, passwordHash, displayName]
    );

    const user = userResult.rows[0];
    const profileResult = await pool.query(
      `insert into profiles (user_id, display_name, profile_type, country)
       values ($1,$2,$3,$4)
       returning *;`,
      [user.id, displayName, cleanText(req.body.profileType || req.body.profile_type, 'explorer'), cleanText(req.body.country, 'United States')]
    );

    res.status(201).json({ token: signUser(user), user: publicUser(user), profile: publicProfile(profileResult.rows[0]) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Account or handle already exists' });
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    await ensureAccountSchema();

    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const result = await pool.query('select * from users where email = $1 limit 1;', [email]);
    if (result.rowCount === 0) return res.status(401).json({ error: 'Invalid email or password' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const profileResult = await pool.query('select * from profiles where user_id = $1 limit 1;', [user.id]);
    res.json({ token: signUser(user), user: publicUser(user), profile: publicProfile(profileResult.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireUser, async (req, res, next) => {
  try {
    const profileResult = await pool.query('select * from profiles where user_id = $1 limit 1;', [req.user.id]);
    res.json({ user: publicUser(req.user), profile: publicProfile(profileResult.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.put('/me/profile', requireUser, async (req, res, next) => {
  try {
    const displayName = cleanText(req.body.displayName || req.body.display_name || req.body.name);
    if (!displayName) return res.status(400).json({ error: 'Display name is required' });

    const result = await pool.query(
      `insert into profiles (user_id, display_name, handle, profile_type, bio, city, state, country, website, instagram, image_url)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (user_id) do update set
         display_name = excluded.display_name,
         handle = excluded.handle,
         profile_type = excluded.profile_type,
         bio = excluded.bio,
         city = excluded.city,
         state = excluded.state,
         country = excluded.country,
         website = excluded.website,
         instagram = excluded.instagram,
         image_url = excluded.image_url,
         updated_at = now()
       returning *;`,
      [
        req.user.id,
        displayName,
        cleanText(req.body.handle) || null,
        cleanText(req.body.profileType || req.body.profile_type, 'explorer'),
        cleanText(req.body.bio),
        cleanText(req.body.city),
        cleanText(req.body.state),
        cleanText(req.body.country, 'United States'),
        cleanText(req.body.website),
        cleanText(req.body.instagram),
        cleanText(req.body.imageUrl || req.body.image_url),
      ]
    );

    res.json({ profile: publicProfile(result.rows[0]) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Handle already exists' });
    next(error);
  }
});

module.exports = { router, requireUser, ensureAccountSchema };
