const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v2: cloudinary } = require('cloudinary');

function cleanText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim();
}

function cleanEmail(value) {
  return cleanText(value).toLowerCase();
}

function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.JWT_SECRET || 'local-dev-only-change-me';
}

function createToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    getAuthSecret(),
    { expiresIn: '30d' }
  );
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    display_name: row.display_name,
    handle: row.handle,
    profileType: row.profile_type,
    profile_type: row.profile_type,
    specialty: row.specialty,
    bio: row.bio,
    city: row.city,
    state: row.state,
    region: row.state,
    country: row.country,
    website: row.website,
    instagram: row.instagram,
    imageUrl: row.image_url,
    image_url: row.image_url,
    isVerified: row.is_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureAccountSchema(pool) {
  if (!pool) return;

  await pool.query('create extension if not exists pgcrypto;');

  await pool.query(`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      email text unique not null,
      password_hash text not null,
      name text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists profiles (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references users(id) on delete cascade,
      display_name text not null,
      handle text unique,
      profile_type text default 'explorer',
      specialty text,
      bio text,
      city text,
      state text,
      country text default 'United States',
      website text,
      instagram text,
      image_url text,
      is_verified boolean default false,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);

  await pool.query('alter table profiles add column if not exists user_id uuid references users(id) on delete cascade;');
  await pool.query('alter table profiles add column if not exists specialty text;');
  await pool.query('create unique index if not exists profiles_user_id_unique on profiles(user_id) where user_id is not null;');
}

async function requireAuth(req, res, next) {
  try {
    const pool = req.app.locals.pool;
    if (!pool) return res.status(503).json({ error: 'Database is not configured yet.' });

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sign in required' });

    const decoded = jwt.verify(token, getAuthSecret());
    await ensureAccountSchema(pool);

    const result = await pool.query('select * from users where id = $1 limit 1;', [decoded.sub]);
    if (result.rowCount === 0) return res.status(401).json({ error: 'User not found' });

    req.user = result.rows[0];
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) return false;

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  return true;
}

function registerAccountRoutes(app, pool) {
  app.locals.pool = pool;

  app.post(['/api/auth/signup', '/auth/signup'], async (req, res, next) => {
    try {
      if (!pool) return res.status(503).json({ error: 'Database is not configured yet.' });
      await ensureAccountSchema(pool);

      const email = cleanEmail(req.body.email);
      const password = cleanText(req.body.password);
      const name = cleanText(req.body.name || req.body.displayName || req.body.display_name);

      if (!email) return res.status(400).json({ error: 'Email is required' });
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

      const passwordHash = await bcrypt.hash(password, 12);
      const userResult = await pool.query(
        `insert into users (email, password_hash, name)
         values ($1, $2, $3)
         returning *;`,
        [email, passwordHash, name || null]
      );

      const user = userResult.rows[0];
      const displayName = name || email.split('@')[0] || 'HERE user';

      const profileResult = await pool.query(
        `insert into profiles (user_id, display_name, handle, profile_type, country)
         values ($1, $2, $3, $4, $5)
         returning *;`,
        [user.id, displayName, null, 'explorer', 'United States']
      );

      res.status(201).json({
        token: createToken(user),
        user: publicUser(user),
        profile: normalizeProfile(profileResult.rows[0]),
      });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
      next(error);
    }
  });

  app.post(['/api/auth/login', '/auth/login'], async (req, res, next) => {
    try {
      if (!pool) return res.status(503).json({ error: 'Database is not configured yet.' });
      await ensureAccountSchema(pool);

      const email = cleanEmail(req.body.email);
      const password = cleanText(req.body.password);
      if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

      const result = await pool.query('select * from users where email = $1 limit 1;', [email]);
      if (result.rowCount === 0) return res.status(401).json({ error: 'Invalid email or password' });

      const user = result.rows[0];
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

      const profileResult = await pool.query('select * from profiles where user_id = $1 limit 1;', [user.id]);

      res.json({
        token: createToken(user),
        user: publicUser(user),
        profile: normalizeProfile(profileResult.rows[0]),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get(['/api/auth/me', '/auth/me'], requireAuth, async (req, res, next) => {
    try {
      const profileResult = await pool.query('select * from profiles where user_id = $1 limit 1;', [req.user.id]);
      res.json({ user: publicUser(req.user), profile: normalizeProfile(profileResult.rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.get(['/api/account/profile', '/account/profile'], requireAuth, async (req, res, next) => {
    try {
      const result = await pool.query('select * from profiles where user_id = $1 limit 1;', [req.user.id]);
      res.json({ profile: normalizeProfile(result.rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.put(['/api/account/profile', '/account/profile'], requireAuth, async (req, res, next) => {
    try {
      await ensureAccountSchema(pool);
      const displayName = cleanText(req.body.displayName || req.body.display_name || req.body.name);
      if (!displayName) return res.status(400).json({ error: 'Display name is required' });

      const result = await pool.query(
        `insert into profiles
          (user_id, display_name, handle, profile_type, specialty, bio, city, state, country, website, instagram, image_url)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (user_id) where user_id is not null do update set
           display_name = excluded.display_name,
           handle = excluded.handle,
           profile_type = excluded.profile_type,
           specialty = excluded.specialty,
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
          cleanText(req.body.specialty || req.body.discipline),
          cleanText(req.body.bio),
          cleanText(req.body.city),
          cleanText(req.body.state || req.body.region),
          cleanText(req.body.country, 'United States'),
          cleanText(req.body.website || req.body.websiteUrl || req.body.website_url),
          cleanText(req.body.instagram),
          cleanText(req.body.imageUrl || req.body.image_url),
        ]
      );

      res.json({ profile: normalizeProfile(result.rows[0]) });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'That handle is already taken' });
      next(error);
    }
  });

  app.post(['/api/uploads/profile-image', '/uploads/profile-image'], requireAuth, async (req, res, next) => {
    try {
      const imageData = cleanText(req.body.imageData || req.body.image || req.body.file);
      if (!imageData) return res.status(400).json({ error: 'Image data is required' });
      if (!configureCloudinary()) return res.status(503).json({ error: 'Image storage is not configured yet' });

      const upload = await cloudinary.uploader.upload(imageData, {
        folder: 'here/profiles',
        public_id: `profile_${req.user.id}`,
        overwrite: true,
        resource_type: 'image',
      });

      await pool.query('update profiles set image_url = $1, updated_at = now() where user_id = $2;', [upload.secure_url, req.user.id]);
      res.status(201).json({ imageUrl: upload.secure_url });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { registerAccountRoutes, requireAuth, ensureAccountSchema };
