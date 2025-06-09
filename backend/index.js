const express = require('express');
const app = express();

console.log("🟡 Server initializing...");

// Middleware to parse JSON
app.use(express.json());

// Root route (quick test)
app.get('/', (req, res) => {
  res.send('Root OK');
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({ status: 'success', message: 'Backend is live!' });
});

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`✅ Backend running on http://${HOST}:${PORT}`);
});



