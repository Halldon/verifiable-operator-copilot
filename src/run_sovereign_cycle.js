#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { appendEvent, sha } = require('./governance_common');

const root = path.resolve(__dirname, '..');
execSync('node src/run_agent.js', { cwd: root, stdio: 'inherit' });
execSync('node src/build_manifest.js', { cwd: root, stdio: 'inherit' });
execSync('node src/sign_manifest.js', { cwd: root, stdio: 'inherit' });
execSync('node src/verify_run.js', { cwd: root, stdio: 'inherit' });

const outputPath = path.join(root, 'artifacts', 'agent_output.json');
const manifestPath = path.join(root, 'artifacts', 'run_manifest.json');
const sigPath = path.join(root, 'artifacts', 'run_manifest.sig.json');

const event = appendEvent({
  type: 'sovereign_cycle_executed',
  outputSha256: sha(fs.readFileSync(outputPath)),
  manifestSha256: sha(fs.readFileSync(manifestPath)),
  signatureSha256: sha(fs.readFileSync(sigPath))
});

console.log(JSON.stringify({ ok:true, eventHash: event.eventHash, prevHash: event.prevHash }, null, 2));
