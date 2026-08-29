require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Safe to expose: Supabase's publishable/anon key is designed for client-side use
// and access is governed by the database's Row Level Security policies.
function getSupabaseConfig() {
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY,
  };
}

// ANTHROPIC_API_KEY is used only here, server-side — it never reaches the browser.
async function checkItem(itemName) {
  const response = await anthropic.messages.create({
    model: 'claude-opus-5',
    max_tokens: 500,
    output_config: { effort: 'low' },
    system:
      'You are a recycling expert. Given the name of an item, decide whether it ' +
      'can typically be recycled in a standard curbside recycling program.\n' +
      'Respond with ONLY a JSON object (no markdown, no code fences) in this exact shape:\n' +
      '{"verdict": "yes" | "no" | "depends", ' +
      '"reasoning": "1-2 sentence explanation of the verdict", ' +
      '"tip": "one practical how-to tip for preparing or disposing of this item"}',
    messages: [{ role: 'user', content: itemName }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  const raw = (textBlock?.text || '').trim();

  let parsed = {};
  try {
    parsed = JSON.parse(raw);
  } catch (parseError) {
    console.error('Failed to parse Claude response as JSON:', raw);
  }

  const verdict = ['yes', 'no', 'depends'].includes(parsed.verdict) ? parsed.verdict : 'depends';
  const reasoning = typeof parsed.reasoning === 'string' && parsed.reasoning
    ? parsed.reasoning
    : 'Not sure about that one — check your local recycling guidelines.';
  const tip = typeof parsed.tip === 'string' && parsed.tip
    ? parsed.tip
    : "When in doubt, rinse it out and check your local program's rules.";

  return { verdict, reasoning, tip };
}

module.exports = { getSupabaseConfig, checkItem };
