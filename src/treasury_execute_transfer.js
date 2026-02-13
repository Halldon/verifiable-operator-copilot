#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ethers } = require('ethers');
const { submitGasless } = require('./gasless_executor');

const root = path.resolve(__dirname, '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'policies', 'treasury_policy.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(root, 'treasury', 'agent-treasury-meta.json'), 'utf8'));

const args = process.argv.slice(2);
const get = (k, d='') => { const i=args.indexOf(k); return i>=0 ? args[i+1] : d; };
const recipient = get('--recipient');
const rpc = get('--rpc');
const nativeAmount = get('--native');
const token = get('--token');
const amount = get('--amount');
const dryRun = args.includes('--dry-run');
const forceOnchain = args.includes('--onchain-only');

if (!recipient || !rpc) throw new Error('Usage: --recipient <addr> --rpc <url> [--native 0.001] OR [--token <erc20> --amount <units>] [--dry-run] [--onchain-only]');
if (!policy.limits.allowedRecipients.includes(recipient)) throw new Error('Recipient not allowlisted');

const passphrase = execSync(`security find-generic-password -a ${meta.keychainRef.account} -s ${meta.keychainRef.service} -w`).toString().trim();
const enc = fs.readFileSync(meta.keystorePath, 'utf8');

(async()=>{
  const wallet = await ethers.Wallet.fromEncryptedJson(enc, passphrase);

  const payload = nativeAmount
    ? {
        chainId: policy.wallet.chainId,
        from: wallet.address,
        to: recipient,
        type: 'native',
        valueWei: ethers.parseEther(nativeAmount).toString()
      }
    : token && amount
      ? {
          chainId: policy.wallet.chainId,
          from: wallet.address,
          to: recipient,
          type: 'erc20',
          token,
          amount
        }
      : null;

  if (!payload) throw new Error('Specify either --native or --token + --amount');

  const preferGasless = policy.execution?.preferGasless && !forceOnchain;
  if (preferGasless) {
    const relayUrl = policy.execution?.gaslessRelay?.relayUrl || process.env.ETHGAS_RELAY_URL || '';
    const apiKeyEnv = policy.execution?.gaslessRelay?.apiKeyEnv || 'ETHGAS_API_KEY';
    const apiKey = process.env[apiKeyEnv] || '';

    const relay = await submitGasless({ relayUrl, apiKey, payload, dryRun });
    if (relay.ok) {
      return console.log(JSON.stringify({ ok:true, rail:'gasless', ...relay }, null, 2));
    }

    if (!policy.execution?.fallbackOnchain) {
      return console.log(JSON.stringify({ ok:false, rail:'gasless', reason: relay.reason || 'failed', details: relay }, null, 2));
    }
  }

  const provider = new ethers.JsonRpcProvider(rpc, policy.wallet.chainId);
  const signer = wallet.connect(provider);

  if (nativeAmount) {
    const tx = { to: recipient, value: ethers.parseEther(nativeAmount) };
    if (dryRun) return console.log(JSON.stringify({ ok:true, rail:'onchain', mode:'dry-run', type:'native', from: wallet.address, tx: { to: tx.to, valueWei: tx.value.toString() } }, null, 2));
    const sent = await signer.sendTransaction(tx);
    await sent.wait();
    return console.log(JSON.stringify({ ok:true, rail:'onchain', type:'native', hash: sent.hash }, null, 2));
  }

  const abi = ['function transfer(address to,uint256 value) returns (bool)','function decimals() view returns (uint8)'];
  const c = new ethers.Contract(token, abi, signer);
  if (dryRun) return console.log(JSON.stringify({ ok:true, rail:'onchain', mode:'dry-run', type:'erc20', from: wallet.address, token, recipient, amount }, null, 2));
  const sent = await c.transfer(recipient, amount);
  await sent.wait();
  return console.log(JSON.stringify({ ok:true, rail:'onchain', type:'erc20', hash: sent.hash, token }, null, 2));
})();
