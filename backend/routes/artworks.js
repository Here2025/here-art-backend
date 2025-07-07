const express = require('express');
const router = express.Router();

// In-memory storage for submitted artworks
let artworks = [];

// POST - Submit new artwork
router.post('/', (req, res) => {
  const { title, image, location, description } = req.body;

  if (!title || !image || !location) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const newArt = {
    id: artworks.length + 1,
    title,
    image,
    location,
    description: description || '',
    createdAt: new Date()
  };

  artworks.push(newArt);
  res.status(201).json({ message: 'Artwork submitted', art: newArt });
});

// GET - Retrieve all submitted artworks
router.get('/', (req, res) => {
  res.json(artworks);
});

module.exports = router;
