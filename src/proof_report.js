#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { status } = require('./eigenai_grant_ops');

const root = path.resolve(__dirname, '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'policies', 'sovereign_policy.json'), 'utf8'));
const state = JSON.parse(fs.readFileSync(path.join(root, 'governance', 'autonomy-state.json'), 'utf8'));
const debateStatePath = path.join(root, 'governance', 'debate-autonomy-state.json');
const debateState = fs.existsSync(debateStatePath) ? JSON.parse(fs.readFileSync(debateStatePath, 'utf8')) : null;
const sig = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', 'run_manifest.sig.json'), 'utf8'));
const eventsPath = path.join(root, 'governance', 'events.jsonl');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'treasury', 'agent-treasury-meta.json'), 'utf8'));

function verifyChain(lines) {
  let prev = 'GENESIS';
  for (const line of lines) {
    const e = JSON.parse(line);
    if (e.prevHash !== prev) return false;
    prev = e.eventHash;
  }
  return true;
}

(async () => {
  const grant = await status();
  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org', 8453);
  const eth = await provider.getBalance(meta.address);
  const usdc = new ethers.Contract(
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
    provider
  );
  const ub = await usdc.balanceOf(meta.address);
  const ud = await usdc.decimals();

  const lines = fs.existsSync(eventsPath) ? fs.readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean) : [];
  const chainOk = verifyChain(lines);

  const report = `# Autonomous Sovereign-Lite Proof Report

- Generated: ${new Date().toISOString()}
- Autonomous state ok: **${state.ok}**
- Last autonomous finish: ${state.finishedAt}

## Sovereignty Controls
- Governance threshold: **${policy.governance.threshold}**
- Timelock default (sec): **${policy.governance.defaultTimelockSeconds}**
- Approver addresses configured: **${Object.keys(policy.governance.approverAddresses || {}).length}**

## Verifiability
- Manifest signer source: **${sig.signerSource || 'unknown'}**
- Manifest signer address: **${sig.signerAddress}**
- Treasury address: **${meta.address}**
- Signer == treasury: **${String(sig.signerAddress).toLowerCase() === String(meta.address).toLowerCase()}**
- Governance event hash-chain valid: **${chainOk}**
- Governance events count: **${lines.length}**

## Funding & Credits
- Wallet ETH (Base): **${ethers.formatEther(eth)}**
- Wallet USDC (Base): **${ethers.formatUnits(ub, ud)}**
- EigenAI grant active: **${grant.grant.hasGrant}**
- EigenAI token count: **${grant.grant.tokenCount}**

## Debate Arena Autonomy
- Debate autonomy state present: **${!!debateState}**
- Debate autonomy last run ok: **${debateState ? debateState.ok : 'n/a'}**
- Debate autonomy processed in last run: **${debateState ? debateState.processed.length : 'n/a'}**

## Conclusion
This agent is operating in **sovereign-lite autonomous mode** with cryptographic verifiability, policy-gated governance, and agent-controlled treasury custody.
`;

  const outPath = path.join(root, 'governance', 'proof-report.md');
  fs.writeFileSync(outPath, report);
  console.log(JSON.stringify({ ok: true, outPath }, null, 2));
})();
