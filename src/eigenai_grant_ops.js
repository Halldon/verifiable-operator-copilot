#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Wallet } = require('ethers');

const root = path.resolve(__dirname, '..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'treasury', 'agent-treasury-meta.json'), 'utf8'));

async function loadWallet() {
  const pass = execSync(`security find-generic-password -a ${meta.keychainRef.account} -s ${meta.keychainRef.service} -w`).toString().trim();
  return Wallet.fromEncryptedJson(fs.readFileSync(meta.keystorePath, 'utf8'), pass);
}

async function checkGrant(address) {
  const r = await fetch(`https://determinal-api.eigenarcade.com/checkGrant?address=${address}`);
  return r.json();
}

async function getGrantMessage(address) {
  const r = await fetch(`https://determinal-api.eigenarcade.com/message?address=${address}`);
  return r.json();
}

async function runInference(wallet, prompt='Reply exactly: AGENT_OK', model='gpt-oss-120b-f16') {
  const gm = await getGrantMessage(wallet.address);
  const sig = await wallet.signMessage(gm.message);
  const payload = {
    messages: [{ role: 'user', content: prompt }],
    model,
    max_tokens: 24,
    seed: 42,
    grantMessage: gm.message,
    grantSignature: sig,
    walletAddress: wallet.address
  };
  const r = await fetch('https://determinal-api.eigenarcade.com/api/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
  });
  return r.json();
}

async function status() {
  const wallet = await loadWallet();
  const grant = await checkGrant(wallet.address);
  return { address: wallet.address, grant };
}

async function smoke() {
  const wallet = await loadWallet();
  const grant = await checkGrant(wallet.address);
  const inf = await runInference(wallet);
  return { address: wallet.address, grant, inference: { id: inf.id, model: inf.model, usage: inf.usage, hasSignature: !!inf.signature } };
}

module.exports = { loadWallet, checkGrant, getGrantMessage, runInference, status, smoke };

if (require.main === module) {
  const mode = process.argv[2] || 'status';
  (mode === 'smoke' ? smoke() : status()).then(x => console.log(JSON.stringify(x, null, 2)));
}
