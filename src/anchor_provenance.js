#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { sha256Hex } = require('./hash_utils');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const get = (k, d='') => { const i=args.indexOf(k); return i>=0 ? args[i+1] : d; };
const has = (k) => args.includes(k);

function resolveDigest() {
  const digestArg = get('--digest', '');
  const fileArg = get('--from-file', '');

  if (digestArg) {
    const d = digestArg.replace(/^0x/, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(d)) throw new Error('Digest must be 32-byte hex');
    return d;
  }

  if (fileArg) {
    const full = path.resolve(root, fileArg);
    return sha256Hex(fs.readFileSync(full));
  }

  const eventsPath = path.join(root, 'governance', 'events.jsonl');
  if (!fs.existsSync(eventsPath)) throw new Error('No digest source provided and governance/events.jsonl missing');
  return sha256Hex(fs.readFileSync(eventsPath));
}

async function verifyTx({ provider, txHash, digest, to }) {
  const tx = await provider.getTransaction(txHash);
  if (!tx) return { ok: false, reason: 'tx_not_found' };
  const data = String(tx.data || '').replace(/^0x/, '').toLowerCase();
  const containsDigest = data.includes(digest);
  const recipientMatches = !to || String(tx.to || '').toLowerCase() === String(to).toLowerCase();
  return {
    ok: containsDigest && recipientMatches,
    containsDigest,
    recipientMatches,
    observedTo: tx.to,
    observedDataPrefix: `0x${data.slice(0, 72)}`
  };
}

(async () => {
  const digest = resolveDigest();
  const chainId = Number(get('--chain-id', get('--chainId', '8453')));
  const rpcEnv = get('--rpc-env', 'BASE_RPC_URL');
  const rpc = get('--rpc', process.env[rpcEnv] || '');
  const toArg = get('--to', '');
  const dryRun = has('--dry-run');

  if (has('--verify')) {
    if (!rpc) throw new Error(`Missing RPC URL for verify. Set --rpc or ${rpcEnv}`);
    const txHash = get('--tx-hash');
    if (!txHash) throw new Error('Usage for verify: --verify --tx-hash <hash> [--digest <hex>|--from-file <path>]');
    const provider = new ethers.JsonRpcProvider(rpc, chainId);
    const result = await verifyTx({ provider, txHash, digest, to: toArg || undefined });
    console.log(JSON.stringify({ ok: result.ok, mode: 'verify', digest: `0x${digest}`, txHash, ...result }, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }

  const data = `0x${digest}`;

  if (dryRun) {
    return console.log(JSON.stringify({
      ok: true,
      mode: 'dry-run',
      chainId,
      digest: `0x${digest}`,
      unsignedTx: {
        to: toArg || '<signer-self>',
        valueWei: '0',
        data
      }
    }, null, 2));
  }

  if (!rpc) throw new Error(`Missing RPC URL. Set --rpc or ${rpcEnv}`);
  const pk = get('--private-key', process.env.ANCHOR_PRIVATE_KEY || '');
  if (!pk) throw new Error('Missing anchor signer key. Set --private-key or ANCHOR_PRIVATE_KEY');

  const provider = new ethers.JsonRpcProvider(rpc, chainId);
  const wallet = new ethers.Wallet(pk, provider);
  const txReq = {
    to: toArg || wallet.address,
    value: 0,
    data
  };
  const tx = await wallet.sendTransaction(txReq);
  const receipt = await tx.wait();

  const verifyResult = await verifyTx({ provider, txHash: tx.hash, digest, to: txReq.to });
  console.log(JSON.stringify({
    ok: verifyResult.ok,
    mode: 'broadcast',
    digest: `0x${digest}`,
    txHash: tx.hash,
    to: txReq.to,
    blockNumber: receipt?.blockNumber,
    verifyResult
  }, null, 2));
  if (!verifyResult.ok) process.exit(1);
})();
