require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://herefavoured.netlify.app';

const allowedOrigins = [
  FRONTEND_URL,
  'https://herefavoured.netlify.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
].filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked origin: ${origin}`));
    },
  })
);

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    })
  : null;

const demoArtworks = [
  {
    id: 'demo-raleigh-mural',
    title: 'Downtown mural walk',
    artist: 'Local artist',
    description: 'A sample HERE location used while the database is being connected.',
    address: 'Downtown Raleigh, NC',
    image_url: '',
    latitude: 35.7796,
    longitude: -78.6382,
    category: 'Mural',
    status: 'published',
    created_at: new Date().toISOString(),
  },
];

async function ensureSchema() {
  if (!pool) return;

  await pool.query(`
    create table if not exists artworks (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      artist text,
      description text,
      address text,
      image_url text,
      latitude double precision,
      longitude double precision,
      category text default 'Public Art',
      status text default 'published',
      submitted_by text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists artists (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      bio text,
      website text,
      instagram text,
      image_url text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);
}

function normalizeArtwork(row) {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    description: row.description,
    address: row.address,
    imageUrl: row.image_url,
    image_url: row.image_url,
    latitude: row.latitude,
    longitude: row.longitude,
    lat: row.latitude,
    lng: row.longitude,
    category: row.category,
    status: row.status,
    submittedBy: row.submitted_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cleanText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim();
}

function cleanNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

app.get('/', (req, res) => {
  res.json({
    app: 'HERE Art Backend',
    status: 'ok',
    database: pool ? 'configured' : 'not_configured',
    frontend: FRONTEND_URL,
  });
});

app.get('/healthz', async (req, res) => {
  let database = 'not_configured';

  if (pool) {
    try {
      await pool.query('select 1 as ok');
      database = 'ok';
    } catch (error) {
      database = 'error';
    }
  }

  res.json({
    status: 'ok',
    service: 'here-art-backend',
    database,
    timestamp: new Date().toISOString(),
  });
});

app.get(['/api/artworks', '/artworks'], async (req, res, next) => {
  try {
    if (!pool) {
      res.json({ artworks: demoArtworks.map(normalizeArtwork), source: 'demo' });
      return;
    }

    await ensureSchema();
    const result = await pool.query(`
      select *
      from artworks
      where status in ('published', 'pending')
      order by created_at desc
      limit 500;
    `);

    res.json({ artworks: result.rows.map(normalizeArtwork), source: 'database' });
  } catch (error) {
    next(error);
  }
});

app.get(['/api/artworks/:id', '/artworks/:id'], async (req, res, next) => {
  try {
    if (!pool) {
      const artwork = demoArtworks.find((item) => item.id === req.params.id);
      if (!artwork) return res.status(404).json({ error: 'Artwork not found' });
      return res.json({ artwork: normalizeArtwork(artwork) });
    }

    await ensureSchema();
    const result = await pool.query('select * from artworks where id = $1 limit 1;', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Artwork not found' });
    res.json({ artwork: normalizeArtwork(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post(['/api/artworks', '/artworks'], async (req, res, next) => {
  try {
    const title = cleanText(req.body.title);
    if (!title) {
      res.status(400).json({ error: 'Artwork title is required' });
      return;
    }

    const payload = {
      title,
      artist: cleanText(req.body.artist, 'Artist unknown'),
      description: cleanText(req.body.description),
      address: cleanText(req.body.address),
      image_url: cleanText(req.body.imageUrl || req.body.image_url),
      latitude: cleanNumber(req.body.latitude ?? req.body.lat),
      longitude: cleanNumber(req.body.longitude ?? req.body.lng),
      category: cleanText(req.body.category, 'Public Art'),
      status: cleanText(req.body.status, 'published'),
      submitted_by: cleanText(req.body.submittedBy || req.body.submitted_by),
    };

    if (!pool) {
      res.status(503).json({
        error: 'Database is not configured yet. Add DATABASE_URL in Railway to save submissions.',
        received: payload,
      });
      return;
    }

    await ensureSchema();
    const result = await pool.query(
      `insert into artworks
        (title, artist, description, address, image_url, latitude, longitude, category, status, submitted_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning *;`,
      [
        payload.title,
        payload.artist,
        payload.description,
        payload.address,
        payload.image_url,
        payload.latitude,
        payload.longitude,
        payload.category,
        payload.status,
        payload.submitted_by,
      ]
    );

    res.status(201).json({ artwork: normalizeArtwork(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.get(['/api/artists', '/artists'], async (req, res, next) => {
  try {
    if (!pool) return res.json({ artists: [], source: 'demo' });
    await ensureSchema();
    const result = await pool.query('select * from artists order by created_at desc limit 200;');
    res.json({ artists: result.rows, source: 'database' });
  } catch (error) {
    next(error);
  }
});

app.post(['/api/artists', '/artists'], async (req, res, next) => {
  try {
    const name = cleanText(req.body.name);
    if (!name) return res.status(400).json({ error: 'Artist name is required' });
    if (!pool) return res.status(503).json({ error: 'Database is not configured yet.' });

    await ensureSchema();
    const result = await pool.query(
      `insert into artists (name, bio, website, instagram, image_url)
       values ($1, $2, $3, $4, $5)
       returning *;`,
      [
        name,
        cleanText(req.body.bio),
        cleanText(req.body.website),
        cleanText(req.body.instagram),
        cleanText(req.body.imageUrl || req.body.image_url),
      ]
    );

    res.status(201).json({ artist: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    error: 'HERE backend error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : error.message,
  });
});

ensureSchema()
  .catch((error) => {
    console.warn('Schema setup skipped or failed:', error.message);
  })
  .finally(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`HERE backend running on port ${PORT}`);
    });
  });
