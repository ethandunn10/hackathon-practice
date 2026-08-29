require('dotenv').config();
const express = require('express');
const path = require('path');
const { getSupabaseConfig, checkItem } = require('./lib/handlers');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/config', (req, res) => {
  res.json(getSupabaseConfig());
});

app.post('/api/check', async (req, res) => {
  const itemName = (req.body?.itemName || '').trim();
  if (!itemName) {
    return res.status(400).json({ error: 'itemName is required' });
  }

  try {
    const result = await checkItem(itemName);
    res.json(result);
  } catch (error) {
    console.error('Anthropic API error:', error);
    res.status(500).json({ error: 'Failed to get a verdict' });
  }
});

// Local dev only — on Vercel, files under public/ are served directly by the
// CDN and express.static() is ignored, per Vercel's Express deployment model.
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
