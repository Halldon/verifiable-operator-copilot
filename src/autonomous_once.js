#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { status, smoke } = require('./eigenai_grant_ops');

const root = path.resolve(__dirname, '..');
const statePath = path.join(root, 'governance', 'autonomy-state.json');

function saveState(s) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(s, null, 2));
}

(async()=>{
  const startedAt = new Date().toISOString();
  const out = { startedAt, ok: false, steps: [] };
  try {
    out.steps.push({ step: 'grant_status', data: await status() });
    out.steps.push({ step: 'run_cycle' });
    execSync('node src/run_sovereign_cycle.js', { cwd: root, stdio: 'inherit' });

    out.steps.push({ step: 'autofund_check' });
    try {
      execSync('node src/treasury_autofund_cycle.js', { cwd: root, stdio: 'inherit' });
      out.steps.push({ step: 'autofund_check', ok: true });
    } catch (e) {
      out.steps.push({ step: 'autofund_check', ok: false, note: 'non-fatal block (e.g., placeholder recipient)' });
    }

    out.steps.push({ step: 'debate_autonomous_cycle' });
    try {
      execSync('node src/debate_autonomous_cycle.js', { cwd: root, stdio: 'inherit' });
      out.steps.push({ step: 'debate_autonomous_cycle', ok: true });
    } catch (e) {
      out.steps.push({ step: 'debate_autonomous_cycle', ok: false, note: 'non-fatal (e.g., malformed queue item)' });
    }

    out.steps.push({ step: 'inference_smoke', data: await smoke() });
    out.ok = true;
  } catch (e) {
    out.error = String(e.message || e);
  }
  out.finishedAt = new Date().toISOString();
  saveState(out);
  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
})();
