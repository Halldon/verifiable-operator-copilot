#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { Wallet } = require('ethers');

const root = path.resolve(__dirname, '..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'treasury', 'agent-treasury-meta.json'), 'utf8'));
const policy = JSON.parse(fs.readFileSync(path.join(root, 'policies', 'treasury_policy.json'), 'utf8'));
const logPath = path.join(root, 'treasury', 'funding-intents.jsonl');

const args = process.argv.slice(2);
const get = (k, d='') => { const i=args.indexOf(k); return i>=0 ? args[i+1] : d; };
const recipient = get('--recipient');
const usd = Number(get('--usd', String(policy.autofund.topupUsd || 1)));
const reason = get('--reason', 'autofund-topup');

if (!recipient) throw new Error('Usage: --recipient <address> [--usd 5] [--reason ...]');
if (usd > Number(policy.limits.maxUsdPerTx || 0)) throw new Error('Blocked by maxUsdPerTx');
if (!policy.limits.allowedRecipients.includes(recipient)) throw new Error('Recipient not allowlisted');

const service = meta.keychainRef.service;
const account = meta.keychainRef.account;
const passphrase = execSync(`security find-generic-password -a ${account} -s ${service} -w`).toString().trim();
const enc = fs.readFileSync(meta.keystorePath, 'utf8');

(async()=>{
  const wallet = await Wallet.fromEncryptedJson(enc, passphrase);
  const payload = {
    ts: new Date().toISOString(),
    from: wallet.address,
    recipient,
    usd,
    reason,
    chainId: meta.chainId,
    policyVersion: policy.version
  };
  const digest = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const message = `treasury_funding_intent:${digest}`;
  const signature = await wallet.signMessage(message);
  const out = { ...payload, digest, message, signature };
  fs.appendFileSync(logPath, JSON.stringify(out) + '\n');
  console.log(JSON.stringify({ ok:true, signedBy: wallet.address, digest, logPath }, null, 2));
})();
