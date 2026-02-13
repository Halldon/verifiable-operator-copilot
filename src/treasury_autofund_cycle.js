#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { status } = require('./eigenai_grant_ops');

const root = path.resolve(__dirname, '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'policies', 'treasury_policy.json'), 'utf8'));
const logPath = path.join(root, 'treasury', 'funding-intents.jsonl');

if (!policy.autofund.enabled) {
  console.log(JSON.stringify({ ok:true, action:'noop', reason:'autofund disabled' }, null, 2));
  process.exit(0);
}

(async()=>{
  const s = await status();
  const credits = Number(s.grant?.tokenCount || 0);
  const threshold = Number(policy.autofund.minCreditsThreshold || 0);

  if (credits >= threshold) {
    console.log(JSON.stringify({ ok:true, action:'noop', reason:'grant credits healthy', credits, threshold }, null, 2));
    return;
  }

  // for grant mode, we can't force top-up onchain today; create signed sovereign intent for manual/provider workflow
  const recipient = policy.limits.allowedRecipients[0];
  execSync(`node src/treasury_sign_funding_intent.js --recipient ${recipient} --usd ${policy.autofund.topupUsd} --reason grant-credits-low`, { cwd: root, stdio: 'inherit' });

  const reminder = {
    ts: new Date().toISOString(),
    kind: 'grant_refill_required',
    credits,
    threshold,
    note: 'EigenAI grant credits below threshold; refresh/request more grant tokens via provider flow.'
  };
  fs.appendFileSync(logPath, JSON.stringify(reminder) + '\n');

  console.log(JSON.stringify({ ok:true, action:'signed_funding_intent_and_logged_refill', credits, threshold }, null, 2));
})();
