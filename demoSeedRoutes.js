const { ensurePlatformSchema } = require('./platformRoutes');

const SEED_KEY = 'here-raleigh-launch';

function addDays(days, hour = 18, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

async function ensureArtworkSchema(pool) {
  await pool.query('create extension if not exists pgcrypto;');
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
}

async function insertProfile(pool, profile) {
  const existing = await pool.query('select id from profiles where handle = $1 limit 1;', [profile.handle]);
  if (existing.rowCount > 0) return { id: existing.rows[0].id, created: false };

  const result = await pool.query(
    `insert into profiles
      (display_name, handle, profile_type, bio, city, state, country, website, instagram, image_url, is_verified)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning id;`,
    [
      profile.displayName,
      profile.handle,
      profile.profileType,
      profile.bio,
      profile.city,
      profile.state,
      profile.country || 'United States',
      profile.website || '',
      profile.instagram || '',
      profile.imageUrl || '',
      Boolean(profile.isVerified),
    ]
  );

  return { id: result.rows[0].id, created: true };
}

async function insertArtwork(pool, artwork) {
  const existing = await pool.query('select id from artworks where title = $1 and address = $2 limit 1;', [artwork.title, artwork.address]);
  if (existing.rowCount > 0) return { id: existing.rows[0].id, created: false };

  const result = await pool.query(
    `insert into artworks
      (title, artist, description, address, image_url, latitude, longitude, category, status, submitted_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning id;`,
    [
      artwork.title,
      artwork.artist,
      artwork.description,
      artwork.address,
      artwork.imageUrl || '',
      artwork.latitude,
      artwork.longitude,
      artwork.category,
      'published',
      'HERE demo seed',
    ]
  );

  return { id: result.rows[0].id, created: true };
}

async function insertEvent(pool, event) {
  const existing = await pool.query('select id from creative_events where title = $1 and venue_name = $2 limit 1;', [event.title, event.venueName]);
  if (existing.rowCount > 0) return { id: existing.rows[0].id, created: false };

  const result = await pool.query(
    `insert into creative_events
      (title, host_profile_id, description, event_type, venue_name, address, city, state, country,
       latitude, longitude, starts_at, ends_at, image_url, ticket_url, price_label, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     returning id;`,
    [
      event.title,
      event.hostProfileId || null,
      event.description,
      event.eventType,
      event.venueName,
      event.address,
      event.city,
      event.state,
      event.country || 'United States',
      event.latitude,
      event.longitude,
      event.startsAt,
      event.endsAt,
      event.imageUrl || '',
      event.ticketUrl || '',
      event.priceLabel || 'Free / check venue',
      'published',
    ]
  );

  return { id: result.rows[0].id, created: true };
}

async function insertJourney(pool, journey) {
  const existing = await pool.query('select id from journeys where title = $1 and city = $2 limit 1;', [journey.title, journey.city]);
  if (existing.rowCount > 0) return { id: existing.rows[0].id, created: false };

  const result = await pool.query(
    `insert into journeys
      (title, description, city, state, country, image_url, curator_profile_id, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning id;`,
    [
      journey.title,
      journey.description,
      journey.city,
      journey.state,
      journey.country || 'United States',
      journey.imageUrl || '',
      journey.curatorProfileId || null,
      'published',
    ]
  );

  return { id: result.rows[0].id, created: true };
}

async function insertJourneyItem(pool, item) {
  const existing = await pool.query(
    'select id from journey_items where journey_id = $1 and item_type = $2 and item_id = $3 limit 1;',
    [item.journeyId, item.itemType, item.itemId]
  );
  if (existing.rowCount > 0) return { created: false };

  await pool.query(
    `insert into journey_items (journey_id, item_type, item_id, sort_order, note)
     values ($1,$2,$3,$4,$5);`,
    [item.journeyId, item.itemType, item.itemId, item.sortOrder || 0, item.note || '']
  );

  return { created: true };
}

async function seedRaleighDemo(pool) {
  if (!pool) throw new Error('Database is not configured.');

  await ensureArtworkSchema(pool);
  await ensurePlatformSchema(pool);

  const counts = {
    profilesCreated: 0,
    artworksCreated: 0,
    eventsCreated: 0,
    journeysCreated: 0,
    journeyItemsCreated: 0,
  };

  const curator = await insertProfile(pool, {
    displayName: 'HERE Raleigh Curator',
    handle: 'here-raleigh-curator',
    profileType: 'collective',
    bio: 'Demo curator profile for building the first Raleigh creative guide inside HERE.',
    city: 'Raleigh',
    state: 'NC',
    isVerified: true,
  });
  if (curator.created) counts.profilesCreated += 1;

  const walllight = await insertProfile(pool, {
    displayName: 'Walllight Studio',
    handle: 'walllight-studio-demo',
    profileType: 'street_artist',
    bio: 'Demo street artist profile representing muralists and public artists who use HERE to show work that lives in the city.',
    city: 'Raleigh',
    state: 'NC',
  });
  if (walllight.created) counts.profilesCreated += 1;

  const oakSound = await insertProfile(pool, {
    displayName: 'Oak City Sound Collective',
    handle: 'oak-city-sound-demo',
    profileType: 'musician',
    bio: 'Demo local music profile for creative events, small shows, and overlooked live performances.',
    city: 'Raleigh',
    state: 'NC',
  });
  if (oakSound.created) counts.profilesCreated += 1;

  const artworks = [];
  for (const artwork of [
    {
      title: 'Demo Color Story Wall',
      artist: 'Walllight Studio',
      description: 'A demo mural-style location showing how HERE can turn public walls into discoverable gallery moments.',
      address: 'Downtown Raleigh, NC',
      latitude: 35.7796,
      longitude: -78.6382,
      category: 'Mural',
    },
    {
      title: 'Demo Hidden Passage Piece',
      artist: 'Unknown public artist',
      description: 'A demo hidden-gem street art stop for testing discovery by neighborhood and walking routes.',
      address: 'Near Moore Square, Raleigh, NC',
      latitude: 35.7774,
      longitude: -78.6357,
      category: 'Street Art',
    },
    {
      title: 'Demo Warehouse District Installation',
      artist: 'Independent artists',
      description: 'A demo public installation point showing how galleries, collectives, and pop-ups can appear on HERE.',
      address: 'Warehouse District, Raleigh, NC',
      latitude: 35.7758,
      longitude: -78.6464,
      category: 'Installation',
    },
  ]) {
    const result = await insertArtwork(pool, artwork);
    if (result.created) counts.artworksCreated += 1;
    artworks.push({ ...artwork, id: result.id });
  }

  const events = [];
  for (const event of [
    {
      title: 'Demo First Friday Creative Walk',
      hostProfileId: curator.id,
      description: 'A demo creative walk showing how HERE can guide people through art, galleries, music, and hidden cultural moments in one evening.',
      eventType: 'Art Walk',
      venueName: 'Downtown Raleigh',
      address: 'Downtown Raleigh, NC',
      city: 'Raleigh',
      state: 'NC',
      latitude: 35.7796,
      longitude: -78.6382,
      startsAt: addDays(3, 18, 30),
      endsAt: addDays(3, 21, 0),
      priceLabel: 'Free demo event',
    },
    {
      title: 'Demo Rooftop Local Sounds Session',
      hostProfileId: oakSound.id,
      description: 'A demo local music listing for bands and performers who need visibility beyond mainstream event platforms.',
      eventType: 'Live Music',
      venueName: 'Oak City Demo Venue',
      address: 'Raleigh, NC',
      city: 'Raleigh',
      state: 'NC',
      latitude: 35.7815,
      longitude: -78.6417,
      startsAt: addDays(5, 19, 0),
      endsAt: addDays(5, 22, 0),
      priceLabel: 'Demo listing',
    },
    {
      title: 'Demo Pop-Up Sketch and Street Art Night',
      hostProfileId: walllight.id,
      description: 'A demo pop-up event for testing artist-led experiences, community drawing nights, and street art culture.',
      eventType: 'Pop-Up Art',
      venueName: 'Warehouse District Demo Space',
      address: 'Warehouse District, Raleigh, NC',
      city: 'Raleigh',
      state: 'NC',
      latitude: 35.7758,
      longitude: -78.6464,
      startsAt: addDays(7, 18, 0),
      endsAt: addDays(7, 20, 30),
      priceLabel: 'Demo listing',
    },
  ]) {
    const result = await insertEvent(pool, event);
    if (result.created) counts.eventsCreated += 1;
    events.push({ ...event, id: result.id });
  }

  const downtownJourney = await insertJourney(pool, {
    title: 'Demo Downtown Raleigh Art Walk',
    description: 'A starter HERE journey showing how the city can become a gallery through murals, hidden passages, installations, and creative events.',
    city: 'Raleigh',
    state: 'NC',
    curatorProfileId: curator.id,
  });
  if (downtownJourney.created) counts.journeysCreated += 1;

  const weekendJourney = await insertJourney(pool, {
    title: 'Demo Creative Weekend in Raleigh',
    description: 'A starter journey combining street art and creative events so users can discover what is happening around them.',
    city: 'Raleigh',
    state: 'NC',
    curatorProfileId: curator.id,
  });
  if (weekendJourney.created) counts.journeysCreated += 1;

  const journeyItems = [
    { journeyId: downtownJourney.id, itemType: 'artwork', itemId: artworks[0].id, sortOrder: 1, note: 'Start with a mural-style gallery moment.' },
    { journeyId: downtownJourney.id, itemType: 'artwork', itemId: artworks[1].id, sortOrder: 2, note: 'Continue to a hidden public art stop.' },
    { journeyId: downtownJourney.id, itemType: 'event', itemId: events[0].id, sortOrder: 3, note: 'End with a creative walk experience.' },
    { journeyId: weekendJourney.id, itemType: 'event', itemId: events[1].id, sortOrder: 1, note: 'Discover local music.' },
    { journeyId: weekendJourney.id, itemType: 'event', itemId: events[2].id, sortOrder: 2, note: 'Add an artist-led pop-up.' },
    { journeyId: weekendJourney.id, itemType: 'artwork', itemId: artworks[2].id, sortOrder: 3, note: 'Close with an installation stop.' },
  ];

  for (const item of journeyItems) {
    const result = await insertJourneyItem(pool, item);
    if (result.created) counts.journeyItemsCreated += 1;
  }

  return counts;
}

function registerDemoSeedRoutes(app, pool) {
  app.get(['/api/demo/seed-raleigh', '/demo/seed-raleigh'], async (req, res, next) => {
    try {
      if (req.query.key !== SEED_KEY) {
        return res.status(403).json({ error: 'Seed key required.' });
      }

      const counts = await seedRaleighDemo(pool);
      res.json({
        status: 'ok',
        message: 'HERE Raleigh demo content seeded.',
        counts,
      });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = {
  registerDemoSeedRoutes,
};
