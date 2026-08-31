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
      'Respond with ONLY the following three lines, in this exact order, and nothing else ' +
      '(no markdown, no code fences, no extra commentary before or after):\n' +
      'VERDICT: [yes, no, or ambiguous]\n' +
      "FOLLOWUP: [one short question if ambiguous, otherwise 'none']\n" +
      'TIP: [a short disposal tip]',
    messages: [{ role: 'user', content: itemName }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  const raw = (textBlock?.text || '').trim();

  const verdictMatch = raw.match(/^VERDICT:\s*(.+)$/im);
  const followupMatch = raw.match(/^FOLLOWUP:\s*(.+)$/im);
  const tipMatch = raw.match(/^TIP:\s*(.+)$/im);

  if (!verdictMatch || !followupMatch || !tipMatch) {
    console.error('Failed to parse Claude response in expected format:', raw);
  }

  const rawVerdict = verdictMatch?.[1].trim().toLowerCase();
  const verdict = ['yes', 'no', 'ambiguous'].includes(rawVerdict) ? rawVerdict : 'ambiguous';
  const rawFollowup = followupMatch?.[1].trim();
  const followup = rawFollowup && rawFollowup.toLowerCase() !== 'none' ? rawFollowup : 'none';
  const tip = tipMatch?.[1].trim() || "When in doubt, rinse it out and check your local program's rules.";

  return { verdict, followup, tip };
}

module.exports = { getSupabaseConfig, checkItem };
