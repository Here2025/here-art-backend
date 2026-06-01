function cleanText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim();
}

function cleanNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getSafeRuntimeDiagnostics(pool) {
  const databaseEnvKeys = [
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_DATABASE_URL',
    'POSTGRES_PRIVATE_URL',
    'POSTGRES_PUBLIC_URL',
    'PGDATABASE',
    'PGHOST',
    'PGPORT',
    'PGUSER',
  ];

  return {
    hasPool: Boolean(pool),
    databaseUrlPresent: Boolean(process.env.DATABASE_URL),
    presentDatabaseEnvKeys: databaseEnvKeys.filter((key) => Boolean(process.env[key])),
    railwayEnvironment: process.env.RAILWAY_ENVIRONMENT_NAME || null,
    railwayService: process.env.RAILWAY_SERVICE_NAME || null,
    railwayProject: process.env.RAILWAY_PROJECT_NAME || null,
  };
}

async function ensurePlatformSchema(pool) {
  if (!pool) return;

  await pool.query('create extension if not exists pgcrypto;');

  await pool.query(`
    create table if not exists profiles (
      id uuid primary key default gen_random_uuid(),
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
      is_verified boolean default false,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists creative_events (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      host_profile_id uuid,
      description text,
      event_type text default 'Creative Event',
      venue_name text,
      address text,
      city text,
      state text,
      country text default 'United States',
      latitude double precision,
      longitude double precision,
      starts_at timestamptz,
      ends_at timestamptz,
      image_url text,
      ticket_url text,
      price_label text,
      status text default 'published',
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists journeys (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      description text,
      city text,
      state text,
      country text default 'United States',
      image_url text,
      curator_profile_id uuid,
      status text default 'published',
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists journey_items (
      id uuid primary key default gen_random_uuid(),
      journey_id uuid not null,
      item_type text not null,
      item_id uuid not null,
      sort_order integer default 0,
      note text,
      created_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists interactions (
      id uuid primary key default gen_random_uuid(),
      profile_id uuid,
      target_type text not null,
      target_id uuid not null,
      interaction_type text not null,
      created_at timestamptz default now()
    );
  `);
}

function normalizeProfile(row) {
  return {
    id: row.id,
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
    isVerified: row.is_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeEvent(row) {
  return {
    id: row.id,
    title: row.title,
    hostProfileId: row.host_profile_id,
    description: row.description,
    eventType: row.event_type,
    venueName: row.venue_name,
    address: row.address,
    city: row.city,
    state: row.state,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
    lat: row.latitude,
    lng: row.longitude,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    imageUrl: row.image_url,
    ticketUrl: row.ticket_url,
    priceLabel: row.price_label,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeJourney(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    city: row.city,
    state: row.state,
    country: row.country,
    imageUrl: row.image_url,
    curatorProfileId: row.curator_profile_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function registerPlatformRoutes(app, pool) {
  app.get(['/api/platform/status', '/platform/status'], async (req, res, next) => {
    try {
      if (!pool) {
        return res.json({
          status: 'ok',
          database: 'not_configured',
          platform: 'planned',
          diagnostics: getSafeRuntimeDiagnostics(pool),
        });
      }

      await ensurePlatformSchema(pool);
      res.json({
        status: 'ok',
        database: 'ok',
        platform: 'enabled',
        diagnostics: getSafeRuntimeDiagnostics(pool),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get(['/api/platform/diagnostics', '/platform/diagnostics'], (req, res) => {
    res.json({
      status: 'ok',
      diagnostics: getSafeRuntimeDiagnostics(pool),
    });
  });

  app.get(['/api/profiles', '/profiles'], async (req, res, next) => {
    try {
      if (!pool) return res.json({ profiles: [], source: 'demo' });
      await ensurePlatformSchema(pool);
      const result = await pool.query('select * from profiles order by created_at desc limit 250;');
      res.json({ profiles: result.rows.map(normalizeProfile), source: 'database' });
    } catch (error) {
      next(error);
    }
  });

  app.post(['/api/profiles', '/profiles'], async (req, res, next) => {
    try {
      const displayName = cleanText(req.body.displayName || req.body.display_name || req.body.name);
      if (!displayName) return res.status(400).json({ error: 'Display name is required' });
      if (!pool) return res.status(503).json({ error: 'Database is not configured yet.' });

      await ensurePlatformSchema(pool);
      const result = await pool.query(
        `insert into profiles
          (display_name, handle, profile_type, bio, city, state, country, website, instagram, image_url, is_verified)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         returning *;`,
        [
          displayName,
          cleanText(req.body.handle),
          cleanText(req.body.profileType || req.body.profile_type, 'explorer'),
          cleanText(req.body.bio),
          cleanText(req.body.city),
          cleanText(req.body.state),
          cleanText(req.body.country, 'United States'),
          cleanText(req.body.website),
          cleanText(req.body.instagram),
          cleanText(req.body.imageUrl || req.body.image_url),
          Boolean(req.body.isVerified || req.body.is_verified),
        ]
      );

      res.status(201).json({ profile: normalizeProfile(result.rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.get(['/api/events', '/events'], async (req, res, next) => {
    try {
      if (!pool) return res.json({ events: [], source: 'demo' });
      await ensurePlatformSchema(pool);
      const result = await pool.query(`
        select *
        from creative_events
        where status in ('published', 'pending')
        order by coalesce(starts_at, created_at) asc
        limit 500;
      `);
      res.json({ events: result.rows.map(normalizeEvent), source: 'database' });
    } catch (error) {
      next(error);
    }
  });

  app.post(['/api/events', '/events'], async (req, res, next) => {
    try {
      const title = cleanText(req.body.title);
      if (!title) return res.status(400).json({ error: 'Event title is required' });
      if (!pool) return res.status(503).json({ error: 'Database is not configured yet.' });

      await ensurePlatformSchema(pool);
      const result = await pool.query(
        `insert into creative_events
          (title, host_profile_id, description, event_type, venue_name, address, city, state, country,
           latitude, longitude, starts_at, ends_at, image_url, ticket_url, price_label, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         returning *;`,
        [
          title,
          cleanText(req.body.hostProfileId || req.body.host_profile_id) || null,
          cleanText(req.body.description),
          cleanText(req.body.eventType || req.body.event_type, 'Creative Event'),
          cleanText(req.body.venueName || req.body.venue_name),
          cleanText(req.body.address),
          cleanText(req.body.city),
          cleanText(req.body.state),
          cleanText(req.body.country, 'United States'),
          cleanNumber(req.body.latitude ?? req.body.lat),
          cleanNumber(req.body.longitude ?? req.body.lng),
          cleanDate(req.body.startsAt || req.body.starts_at),
          cleanDate(req.body.endsAt || req.body.ends_at),
          cleanText(req.body.imageUrl || req.body.image_url),
          cleanText(req.body.ticketUrl || req.body.ticket_url),
          cleanText(req.body.priceLabel || req.body.price_label),
          cleanText(req.body.status, 'published'),
        ]
      );

      res.status(201).json({ event: normalizeEvent(result.rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.get(['/api/journeys', '/journeys'], async (req, res, next) => {
    try {
      if (!pool) return res.json({ journeys: [], source: 'demo' });
      await ensurePlatformSchema(pool);
      const result = await pool.query(`
        select *
        from journeys
        where status in ('published', 'pending')
        order by created_at desc
        limit 250;
      `);
      res.json({ journeys: result.rows.map(normalizeJourney), source: 'database' });
    } catch (error) {
      next(error);
    }
  });

  app.post(['/api/journeys', '/journeys'], async (req, res, next) => {
    try {
      const title = cleanText(req.body.title);
      if (!title) return res.status(400).json({ error: 'Journey title is required' });
      if (!pool) return res.status(503).json({ error: 'Database is not configured yet.' });

      await ensurePlatformSchema(pool);
      const result = await pool.query(
        `insert into journeys
          (title, description, city, state, country, image_url, curator_profile_id, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         returning *;`,
        [
          title,
          cleanText(req.body.description),
          cleanText(req.body.city),
          cleanText(req.body.state),
          cleanText(req.body.country, 'United States'),
          cleanText(req.body.imageUrl || req.body.image_url),
          cleanText(req.body.curatorProfileId || req.body.curator_profile_id) || null,
          cleanText(req.body.status, 'published'),
        ]
      );

      res.status(201).json({ journey: normalizeJourney(result.rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.get(['/api/discovery', '/discovery'], async (req, res, next) => {
    try {
      if (!pool) {
        return res.json({ items: [], source: 'demo' });
      }

      await ensurePlatformSchema(pool);
      const [artworks, events] = await Promise.all([
        pool.query(`
          select id, title, artist as subtitle, description, address, latitude, longitude, category, image_url, created_at
          from artworks
          where status in ('published', 'pending')
          order by created_at desc
          limit 100;
        `),
        pool.query(`
          select id, title, event_type as subtitle, description, address, latitude, longitude, event_type as category, image_url, starts_at as created_at
          from creative_events
          where status in ('published', 'pending')
          order by coalesce(starts_at, created_at) asc
          limit 100;
        `),
      ]);

      const artworkItems = artworks.rows.map((row) => ({ ...row, itemType: 'artwork' }));
      const eventItems = events.rows.map((row) => ({ ...row, itemType: 'event' }));

      res.json({ items: [...artworkItems, ...eventItems], source: 'database' });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = {
  registerPlatformRoutes,
  ensurePlatformSchema,
};
