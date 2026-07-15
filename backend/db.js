const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL
  || process.env.POSTGRES_URL
  || process.env.POSTGRES_DATABASE_URL
  || process.env.POSTGRES_PRIVATE_URL
  || process.env.POSTGRES_PUBLIC_URL;

function getSslConfig(url) {
  if (!url) return false;
  const mode = String(process.env.PGSSLMODE || '').toLowerCase();
  if (mode === 'disable') return false;
  if (mode === 'require') return { rejectUnauthorized: false };

  try {
    const host = new URL(url).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.includes('railway.internal')) return false;
  } catch (error) {
    return false;
  }

  return { rejectUnauthorized: false };
}

const pool = DATABASE_URL
  ? new Pool({ connectionString: DATABASE_URL, ssl: getSslConfig(DATABASE_URL) })
  : null;

module.exports = { pool, DATABASE_URL };
