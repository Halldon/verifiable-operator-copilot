const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const govDir = path.join(root, 'governance');
const proposalsDir = path.join(govDir, 'proposals');
const approvalsDir = path.join(govDir, 'approvals');
const eventsPath = path.join(govDir, 'events.jsonl');

function ensureDirs() {
  fs.mkdirSync(proposalsDir, { recursive: true });
  fs.mkdirSync(approvalsDir, { recursive: true });
}

function sha(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function nowIso() { return new Date().toISOString(); }

function readPolicy() {
  return JSON.parse(fs.readFileSync(path.join(root, 'policies', 'sovereign_policy.json'), 'utf8'));
}

function appendEvent(event) {
  ensureDirs();
  let prevHash = 'GENESIS';
  if (fs.existsSync(eventsPath)) {
    const lines = fs.readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean);
    if (lines.length) prevHash = JSON.parse(lines[lines.length - 1]).eventHash;
  }
  const payload = { ...event, ts: nowIso(), prevHash };
  payload.eventHash = sha(JSON.stringify(payload));
  fs.appendFileSync(eventsPath, JSON.stringify(payload) + '\n');
  return payload;
}

module.exports = { root, govDir, proposalsDir, approvalsDir, eventsPath, ensureDirs, sha, nowIso, readPolicy, appendEvent };
