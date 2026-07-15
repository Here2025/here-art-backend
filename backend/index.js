require('dotenv').config();

const express = require('express');
const cors = require('cors');
const artworksRoute = require('./routes/artworks');
const { router: authRoute, ensureAccountSchema } = require('./routes/auth');
const { pool } = require('./db');

const app = express();
console.log('HERE backend initializing...');

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://herefavoured.netlify.app',
  'https://here-art-frontend-production.up.railway.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS: ' + origin));
  },
}));

app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

app.get('/', (req, res) => {
  res.json({ app: 'HERE backend', status: 'ok', database: pool ? 'configured' : 'not_configured' });
});

app.get('/api/test', (req, res) => {
  res.json({ status: 'success', message: 'Backend is live!' });
});

app.get('/api/health', async (req, res) => {
  let database = pool ? 'configured' : 'not_configured';
  if (pool) {
    try {
      await pool.query('select 1 as ok');
      database = 'ok';
    } catch (error) {
      database = 'error';
    }
  }
  res.json({ status: 'ok', database });
});

app.use('/api/auth', authRoute);
app.use('/api/artworks', artworksRoute);

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'HERE backend error', message: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : error.message });
});

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

ensureAccountSchema()
  .catch((error) => console.warn('Account schema setup skipped:', error.message))
  .finally(() => {
    app.listen(PORT, HOST, () => {
      console.log(`Backend running on http://${HOST}:${PORT}`);
    });
  });
