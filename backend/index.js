const express = require('express');
const app = express();

console.log("🟡 Server initializing...");

// Middleware to parse JSON
app.use(express.json());

// Root route (quick test)
app.get('/', (req, res) => {
  res.send('Root OK');
});

// Health check route
app.get('/api/test', (req, res) => {
  res.json({ status: 'success', message: 'Backend is live!' });
});

// Dummy artwork data route
app.get('/api/artworks', (req, res) => {
  res.json([
    {
      id: 1,
      title: 'Mural of Hope',
      type: 'Mural',
      coordinates: [35.7796, -78.6382],
    },
    {
      id: 2,
      title: 'Statue of Light',
      type: 'Sculpture',
      coordinates: [35.7800, -78.6400],
    },
  ]);
});

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`✅ Backend running on http://${HOST}:${PORT}`);
});



