#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ethers } = require('ethers');

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

if (!recipient || !rpc) throw new Error('Usage: --recipient <addr> --rpc <url> [--native 0.001] OR [--token <erc20> --amount <units>] [--dry-run]');
if (!policy.limits.allowedRecipients.includes(recipient)) throw new Error('Recipient not allowlisted');

const passphrase = execSync(`security find-generic-password -a ${meta.keychainRef.account} -s ${meta.keychainRef.service} -w`).toString().trim();
const enc = fs.readFileSync(meta.keystorePath, 'utf8');

(async()=>{
  const wallet = await ethers.Wallet.fromEncryptedJson(enc, passphrase);
  const provider = new ethers.JsonRpcProvider(rpc, policy.wallet.chainId);
  const signer = wallet.connect(provider);

  if (nativeAmount) {
    const tx = { to: recipient, value: ethers.parseEther(nativeAmount) };
    if (dryRun) return console.log(JSON.stringify({ ok:true, mode:'dry-run', type:'native', from: wallet.address, tx }, null, 2));
    const sent = await signer.sendTransaction(tx);
    await sent.wait();
    return console.log(JSON.stringify({ ok:true, type:'native', hash: sent.hash }, null, 2));
  }

  if (token && amount) {
    const abi = ['function transfer(address to,uint256 value) returns (bool)','function decimals() view returns (uint8)'];
    const c = new ethers.Contract(token, abi, signer);
    if (dryRun) return console.log(JSON.stringify({ ok:true, mode:'dry-run', type:'erc20', from: wallet.address, token, recipient, amount }, null, 2));
    const sent = await c.transfer(recipient, amount);
    await sent.wait();
    return console.log(JSON.stringify({ ok:true, type:'erc20', hash: sent.hash, token }, null, 2));
  }

  throw new Error('Specify either --native or --token + --amount');
})();
