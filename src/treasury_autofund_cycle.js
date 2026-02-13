#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'policies', 'treasury_policy.json'), 'utf8'));

// Placeholder credit probe (replace with real EigenCompute credit API call when available)
function getCurrentCredits() {
  const p = path.join(root, 'treasury', 'mock-credits.json');
  if (!fs.existsSync(p)) return 0;
  return Number(JSON.parse(fs.readFileSync(p, 'utf8')).credits || 0);
}

if (!policy.autofund.enabled) {
  console.log(JSON.stringify({ ok:true, action:'noop', reason:'autofund disabled' }, null, 2));
  process.exit(0);
}

const credits = getCurrentCredits();
if (credits >= Number(policy.autofund.minCreditsThreshold || 0)) {
  console.log(JSON.stringify({ ok:true, action:'noop', reason:'credits healthy', credits }, null, 2));
  process.exit(0);
}

const recipient = policy.limits.allowedRecipients[0];
if (!recipient || recipient.includes('PLACEHOLDER')) {
  console.log(JSON.stringify({ ok:false, action:'blocked', reason:'recipient placeholder not configured' }, null, 2));
  process.exit(1);
}

execSync(`node src/treasury_sign_funding_intent.js --recipient ${recipient} --usd ${policy.autofund.topupUsd} --reason low-credits`, { cwd: root, stdio: 'inherit' });
console.log(JSON.stringify({ ok:true, action:'signed_funding_intent', credits }, null, 2));
