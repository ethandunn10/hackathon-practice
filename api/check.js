const { checkItem } = require('../lib/handlers');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const itemName = (req.body?.itemName || '').trim();
  if (!itemName) {
    return res.status(400).json({ error: 'itemName is required' });
  }

  try {
    const result = await checkItem(itemName);
    res.status(200).json(result);
  } catch (error) {
    console.error('Anthropic API error:', error);
    res.status(500).json({ error: 'Failed to get a verdict' });
  }
};
