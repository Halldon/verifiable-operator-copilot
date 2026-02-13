#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Wallet } = require('ethers');

const root = path.resolve(__dirname, '..');
const policyPath = path.join(root, 'policies', 'sovereign_policy.json');
const secretsPath = path.join(root, 'governance', 'approver-local-secrets.json');

const labels = ['james', 'ops-peer', 'safety-peer'];
const wallets = labels.map(label => ({ label, wallet: Wallet.createRandom() }));

const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
policy.governance.approverAddresses = Object.fromEntries(wallets.map(w => [w.label, w.wallet.address]));
fs.writeFileSync(policyPath, JSON.stringify(policy, null, 2));

fs.mkdirSync(path.dirname(secretsPath), { recursive: true });
fs.writeFileSync(secretsPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: 'Local demo approver keys. Keep private. Rotate for real usage.',
  approvers: Object.fromEntries(wallets.map(w => [w.label, { address: w.wallet.address, privateKey: w.wallet.privateKey }]))
}, null, 2));

console.log(JSON.stringify({ ok: true, policyUpdated: policyPath, secretsPath }, null, 2));
