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

function extractField(raw, field) {
  const match = raw.match(new RegExp(`^${field}:\\s*(.+)$`, 'im'));
  return match ? match[1].trim() : '';
}

// Lets Claude look up current, general recycling facts (e.g. "are aseptic
// cartons curbside recyclable") instead of relying only on training data,
// which can be stale or wrong for evolving materials/packaging.
const RECYCLING_TOOLS = [{ type: 'web_search_20260209', name: 'web_search' }];

const WEB_SEARCH_GUIDANCE =
  'Use the web_search tool when it would materially improve accuracy — for example to ' +
  'confirm current, general recycling guidance for a specific material or packaging type — ' +
  'rather than relying purely on memorized facts that may be outdated. You do not have ' +
  "access to the user's specific local program, so only search for general, widely-applicable " +
  "recycling facts, never anything location-specific to the user.\n";

// Sends one prompt to Claude with the recycling web-search tool enabled and
// returns the concatenated text of the response. Web search is a server-side
// tool: Claude runs it and continues automatically within the same call, but
// a very long tool round-trip can still pause with stop_reason "pause_turn",
// so this resumes until Claude actually finishes.
async function askClaude(systemPrompt, userContent) {
  let messages = [{ role: 'user', content: userContent }];
  let response;

  do {
    response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 2000,
      output_config: { effort: 'low' },
      system: systemPrompt,
      tools: RECYCLING_TOOLS,
      messages,
    });

    if (response.stop_reason === 'pause_turn') {
      messages = [...messages, { role: 'assistant', content: response.content }];
    }
  } while (response.stop_reason === 'pause_turn');

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

// ANTHROPIC_API_KEY is used only here, server-side — it never reaches the browser.
async function checkItem(itemName) {
  const raw = await askClaude(
    'You are a recycling expert. Given the name of an item, decide whether it ' +
      'can typically be recycled in a standard curbside recycling program.\n' +
      WEB_SEARCH_GUIDANCE +
      'If the verdict is ambiguous, you may ask ONE follow-up question — but only about a ' +
      'physical, observable property of the item itself that the user can check just by ' +
      "looking at or handling it: e.g. its material, size, whether it's clean or dirty/greasy, " +
      'what kind of container or packaging it is, whether parts are separable. ' +
      'NEVER ask about anything requiring outside knowledge the user is unlikely to have, such ' +
      "as their specific local/curbside program's rules, municipal policy, or facility " +
      "capabilities — the user asking you almost certainly doesn't know that either, which is " +
      'the entire reason they are asking you.\n' +
      'Respond with ONLY the following three lines, in this exact order, and nothing else ' +
      '(no markdown, no code fences, no extra commentary before or after):\n' +
      'VERDICT: [yes, no, or ambiguous]\n' +
      "FOLLOWUP: [one short question about the item's physical properties if ambiguous, " +
      "otherwise 'none']\n" +
      'TIP: [a short disposal tip]',
    itemName,
  );

  const rawVerdict = extractField(raw, 'VERDICT').toLowerCase();
  const rawFollowup = extractField(raw, 'FOLLOWUP');
  const tip = extractField(raw, 'TIP');

  if (!rawVerdict || !tip) {
    console.error('Failed to parse Claude response in expected format:', raw);
  }

  const verdict = ['yes', 'no', 'ambiguous'].includes(rawVerdict) ? rawVerdict : 'ambiguous';
  const followup = rawFollowup && rawFollowup.toLowerCase() !== 'none' ? rawFollowup : 'none';

  return { verdict, followup, tip: tip || "When in doubt, rinse it out and check your local program's rules." };
}

// Second-pass call used once the user has answered the follow-up question
// from checkItem(). Sends the original item, the question that was asked,
// and the user's answer, and asks Claude for one decisive final verdict —
// no further follow-up is requested or handled.
async function checkItemFollowup(itemName, question, answer) {
  const raw = await askClaude(
    'You are a recycling expert. You previously gave an ambiguous verdict on whether an ' +
      'item can be recycled and asked the user a follow-up question. Given the item, the ' +
      "question you asked, and the user's answer, give your best final, decisive verdict — " +
      'avoid answering "ambiguous" again unless it is truly impossible to resolve.\n' +
      WEB_SEARCH_GUIDANCE +
      'Respond with ONLY the following two lines, in this exact order, and nothing else ' +
      '(no markdown, no code fences, no extra commentary before or after):\n' +
      'VERDICT: [yes, no, or ambiguous]\n' +
      'TIP: [a short disposal tip]',
    `Item: ${itemName}\nQuestion asked: ${question}\nUser's answer: ${answer}`,
  );

  const rawVerdict = extractField(raw, 'VERDICT').toLowerCase();
  const tip = extractField(raw, 'TIP');

  if (!rawVerdict || !tip) {
    console.error('Failed to parse Claude response in expected format:', raw);
  }

  const verdict = ['yes', 'no', 'ambiguous'].includes(rawVerdict) ? rawVerdict : 'ambiguous';
  return { verdict, tip: tip || "When in doubt, rinse it out and check your local program's rules." };
}

module.exports = { getSupabaseConfig, checkItem, checkItemFollowup };
