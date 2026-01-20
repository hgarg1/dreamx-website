const express = require('express');
const { getEasterEggPage } = require('../db');
const router = express.Router();

// Route handler for special pages
router.get('/harshit-garg', async (req, res) => {
  try {
    const pageCode = await getEasterEggPage('/harshit-garg');
    
    if (!pageCode) {
      return res.status(404).send('Page not found');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(pageCode);
  } catch (error) {
    console.error('Error loading page:', error);
    res.status(500).send('Error loading page.');
  }
});

module.exports = router;
