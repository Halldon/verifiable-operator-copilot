const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { root } = require('./governance_common');

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Hex(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith('--')) continue;
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[part.slice(2)] = true;
    else {
      out[part.slice(2)] = next;
      i += 1;
    }
  }
  return out;
}

function cleanText(v) {
  return String(v || '').replace(/\r\n/g, '\n').trim();
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function loadDebatePolicy() {
  return readJson(path.join(root, 'policies', 'debate_policy.json'));
}

function normalizeRubric(rawRubric, policy) {
  const source = Array.isArray(rawRubric) && rawRubric.length ? rawRubric : policy.defaultRubric;
  if (!Array.isArray(source) || !source.length) throw new Error('Rubric is empty');

  const rubric = source.map((r, idx) => {
    const id = cleanText(r.id || `criterion_${idx + 1}`).toLowerCase();
    if (!id) throw new Error(`Rubric id missing at index ${idx}`);
    const label = cleanText(r.label || id);
    const weight = Number(r.weight);
    if (!Number.isFinite(weight) || weight <= 0) throw new Error(`Invalid rubric weight for '${id}'`);
    return { id, label, weight };
  });

  const total = rubric.reduce((sum, r) => sum + r.weight, 0);
  return rubric.map((r) => ({ ...r, weight: Number((r.weight / total).toFixed(6)) }));
}

function normalizeDebateInput(rawInput, policy) {
  if (!rawInput || typeof rawInput !== 'object') throw new Error('Debate input must be a JSON object');

  const prompt = cleanText(rawInput.prompt || rawInput.topic || rawInput.debatePrompt);
  if (!prompt) throw new Error('Debate input requires prompt/topic/debatePrompt');

  if (!Array.isArray(rawInput.candidates)) throw new Error('Debate input requires candidates[]');
  const candidates = rawInput.candidates.map((candidate, idx) => {
    const id = cleanText(candidate.id || `debater_${idx + 1}`);
    const name = cleanText(candidate.name || id);
    const argument = cleanText(candidate.argument || candidate.text || candidate.claim);
    if (!id) throw new Error(`Candidate ${idx + 1} missing id`);
    if (!argument) throw new Error(`Candidate '${id}' missing argument`);
    return { id, name, argument };
  });

  const duplicate = candidates.find((c, idx) => candidates.findIndex((x) => x.id === c.id) !== idx);
  if (duplicate) throw new Error(`Duplicate candidate id: ${duplicate.id}`);

  const rubric = normalizeRubric(rawInput.rubric, policy);

  return {
    prompt,
    context: cleanText(rawInput.context || ''),
    candidates,
    rubric,
    metadata: rawInput.metadata && typeof rawInput.metadata === 'object' ? rawInput.metadata : {}
  };
}

function enforcePolicyLimits(input, policy) {
  const limits = policy.limits || {};
  const minDebaters = Number(limits.minDebaters || 2);
  const maxDebaters = Number(limits.maxDebaters || 6);

  if (input.candidates.length < minDebaters) throw new Error(`Need at least ${minDebaters} candidates`);
  if (input.candidates.length > maxDebaters) throw new Error(`Too many candidates (max ${maxDebaters})`);

  const maxPromptChars = Number(limits.maxPromptChars || 2000);
  if (input.prompt.length > maxPromptChars) throw new Error(`Prompt exceeds maxPromptChars=${maxPromptChars}`);

  const maxArgumentChars = Number(limits.maxArgumentChars || 4000);
  for (const c of input.candidates) {
    if (c.argument.length > maxArgumentChars) {
      throw new Error(`Argument for '${c.id}' exceeds maxArgumentChars=${maxArgumentChars}`);
    }
  }

  const totalChars = input.prompt.length + input.context.length + input.candidates.reduce((sum, c) => sum + c.argument.length, 0);
  const maxTotalInputChars = Number(limits.maxTotalInputChars || 22000);
  if (totalChars > maxTotalInputChars) throw new Error(`Total debate input chars exceed maxTotalInputChars=${maxTotalInputChars}`);
}

function buildJudgePrompt(input) {
  const rubricRules = input.rubric
    .map((r) => `- ${r.id}: ${r.label} (weight=${r.weight})`) 
    .join('\n');

  const candidateBlock = input.candidates
    .map((c) => `- id: ${c.id}\n  name: ${c.name}\n  argument: ${c.argument}`)
    .join('\n');

  return [
    'You are Verifiable Debate Arena Judge v1.',
    'Evaluate arguments impartially.',
    'Score each candidate on every rubric criterion with integer scores from 0 to 10.',
    'Reasoning must be concise and evidence-oriented.',
    '',
    'Return final output enclosed in <VERDICT_JSON>...</VERDICT_JSON>.',
    'Inside the tags return strict valid JSON with this schema:',
    '{',
    '  "winner_id": "<candidate_id>",',
    '  "scores": [',
    '    {',
    '      "id": "<candidate_id>",',
    '      "rubric": {"<criterion_id>": 0},',
    '      "reason": "<max 2 sentences>"',
    '    }',
    '  ],',
    '  "judge_reasoning": "<short final reasoning>"',
    '}',
    'Do not include markdown fences.',
    '',
    `Prompt: ${input.prompt}`,
    input.context ? `Context: ${input.context}` : 'Context: (none)',
    'Rubric:',
    rubricRules,
    'Candidates:',
    candidateBlock
  ].join('\n');
}

function extractVerdictJson(rawText) {
  const text = String(rawText || '');
  const matches = [...text.matchAll(/<VERDICT_JSON>([\s\S]*?)<\/VERDICT_JSON>/g)];
  if (!matches.length) throw new Error('Model output missing <VERDICT_JSON> envelope');

  const rawEnvelope = matches[matches.length - 1][1].trim();
  const firstBrace = rawEnvelope.indexOf('{');
  const lastBrace = rawEnvelope.lastIndexOf('}');
  const jsonText = (firstBrace >= 0 && lastBrace > firstBrace)
    ? rawEnvelope.slice(firstBrace, lastBrace + 1).trim()
    : rawEnvelope;

  return { jsonText, parsed: JSON.parse(jsonText), rawEnvelope };
}

function normalizeModelVerdict(modelVerdict, input, policy) {
  const byId = new Map();
  for (const row of Array.isArray(modelVerdict.scores) ? modelVerdict.scores : []) {
    if (row && typeof row === 'object' && row.id) byId.set(String(row.id), row);
  }

  const maxReasonChars = Number(policy?.limits?.maxReasonChars || 600);

  const scores = input.candidates.map((candidate) => {
    const row = byId.get(candidate.id) || {};
    const rubric = {};
    for (const criterion of input.rubric) {
      const raw = Number(row?.rubric?.[criterion.id]);
      rubric[criterion.id] = Number.isFinite(raw) ? clamp(Math.round(raw), 0, 10) : 0;
    }

    const overall = Number(
      input.rubric
        .reduce((sum, criterion) => sum + rubric[criterion.id] * criterion.weight, 0)
        .toFixed(4)
    );

    const reason = cleanText(row.reason || '').slice(0, maxReasonChars);
    return {
      id: candidate.id,
      name: candidate.name,
      overall,
      rubric,
      reason
    };
  });

  const sorted = [...scores].sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  const winnerId = sorted[0]?.id || null;

  return {
    winnerId,
    modelWinnerId: cleanText(modelVerdict.winner_id || ''),
    scores,
    rubric: input.rubric,
    judgeReasoning: cleanText(modelVerdict.judge_reasoning || '')
  };
}

function getLatestGovernanceHash() {
  const eventsPath = path.join(root, 'governance', 'events.jsonl');
  if (!fs.existsSync(eventsPath)) return 'GENESIS';
  const lines = fs.readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean);
  if (!lines.length) return 'GENESIS';
  return JSON.parse(lines[lines.length - 1]).eventHash;
}

module.exports = {
  root,
  nowIso,
  ensureDir,
  readJson,
  writeJson,
  canonicalize,
  stableStringify,
  sha256Hex,
  parseArgs,
  cleanText,
  loadDebatePolicy,
  normalizeDebateInput,
  enforcePolicyLimits,
  buildJudgePrompt,
  extractVerdictJson,
  normalizeModelVerdict,
  getLatestGovernanceHash
};
