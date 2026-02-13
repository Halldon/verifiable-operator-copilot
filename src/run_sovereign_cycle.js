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
const receiptOut = path.join(root, 'artifacts', 'execution-receipts', 'latest.json');
if (process.env.RECEIPT_SIGNER_PRIVATE_KEY) {
  fs.mkdirSync(path.dirname(receiptOut), { recursive: true });
  execSync(
    `node src/generate_execution_receipt.js --input artifacts/agent_output.json --code src/run_agent.js --output artifacts/run_manifest.json --operation sovereign_cycle --out ${receiptOut}`,
    { cwd: root, stdio: 'inherit', env: process.env }
  );
}

const manifestPath = path.join(root, 'artifacts', 'run_manifest.json');
const sigPath = path.join(root, 'artifacts', 'run_manifest.sig.json');

const event = appendEvent({
  type: 'sovereign_cycle_executed',
  outputSha256: sha(fs.readFileSync(outputPath)),
  manifestSha256: sha(fs.readFileSync(manifestPath)),
  signatureSha256: sha(fs.readFileSync(sigPath)),
  executionReceiptSha256: fs.existsSync(receiptOut) ? sha(fs.readFileSync(receiptOut)) : null
});

console.log(JSON.stringify({ ok:true, eventHash: event.eventHash, prevHash: event.prevHash }, null, 2));
