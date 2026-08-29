require('dotenv').config();
const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json());

// Safe to expose: Supabase's publishable/anon key is designed for client-side use
// and access is governed by the database's Row Level Security policies.
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY,
  });
});

// ANTHROPIC_API_KEY is used only here, server-side — it never reaches the browser.
app.post('/api/check', async (req, res) => {
  const itemName = (req.body?.itemName || '').trim();
  if (!itemName) {
    return res.status(400).json({ error: 'itemName is required' });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 256,
      output_config: { effort: 'low' },
      system:
        'You are a recycling expert. Given the name of an item, decide whether it ' +
        'can typically be recycled in a standard curbside recycling program. ' +
        'Respond with ONLY one lowercase word: "yes", "no", or "depends" — no other text.',
      messages: [{ role: 'user', content: itemName }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const raw = (textBlock?.text || '').trim().toLowerCase();
    const verdict = ['yes', 'no', 'depends'].includes(raw) ? raw : 'depends';

    res.json({ verdict });
  } catch (error) {
    console.error('Anthropic API error:', error);
    res.status(500).json({ error: 'Failed to get a verdict' });
  }
});

app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
