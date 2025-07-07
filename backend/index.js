const express = require('express');
const cors = require('cors');
const artworksRoute = require('./routes/artworks');

const app = express();
console.log("🟡 Server initializing...");

// CORS setup to allow frontend (local or production) to access the backend
const allowedOrigins = [
  'http://localhost:3000',
  'https://here-art-frontend-production.up.railway.app' // Add your frontend domain if deployed
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  }
}));

app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.send('Root OK');
});

app.get('/api/test', (req, res) => {
  res.json({ status: 'success', message: 'Backend is live!' });
});

app.use('/api/artworks', artworksRoute);

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`✅ Backend running on http://${HOST}:${PORT}`);
});




