const express = require('express');
const app = express();

// Middleware to parse JSON
app.use(express.json());

// Test route
app.get('/api/test', (req, res) => {
  res.json({ status: 'success', message: 'Backend is live!' });
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
