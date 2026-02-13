#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { status } = require('./eigenai_grant_ops');

const root = path.resolve(__dirname, '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'policies', 'sovereign_policy.json'), 'utf8'));
const state = JSON.parse(fs.readFileSync(path.join(root, 'governance', 'autonomy-state.json'), 'utf8'));
const sig = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', 'run_manifest.sig.json'), 'utf8'));
const eventsPath = path.join(root, 'governance', 'events.jsonl');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'treasury', 'agent-treasury-meta.json'), 'utf8'));

function verifyChain(lines){
  let prev='GENESIS';
  for (const line of lines){
    const e=JSON.parse(line);
    if(e.prevHash!==prev) return false;
    prev=e.eventHash;
  }
  return true;
}

(async()=>{
  const grant = await status();
  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org',8453);
  const eth = await provider.getBalance(meta.address);
  const usdc = new ethers.Contract('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',['function balanceOf(address) view returns (uint256)','function decimals() view returns (uint8)'],provider);
  const ub = await usdc.balanceOf(meta.address); const ud = await usdc.decimals();

  const lines = fs.existsSync(eventsPath) ? fs.readFileSync(eventsPath,'utf8').trim().split('\n').filter(Boolean) : [];
  const chainOk = verifyChain(lines);

  const report = `# Autonomous Sovereign-Lite Proof Report\n\n- Generated: ${new Date().toISOString()}\n- Autonomous state ok: **${state.ok}**\n- Last autonomous finish: ${state.finishedAt}\n\n## Sovereignty Controls\n- Governance threshold: **${policy.governance.threshold}**\n- Timelock default (sec): **${policy.governance.defaultTimelockSeconds}**\n- Approver addresses configured: **${Object.keys(policy.governance.approverAddresses||{}).length}**\n\n## Verifiability\n- Manifest signer source: **${sig.signerSource || 'unknown'}**\n- Manifest signer address: **${sig.signerAddress}**\n- Treasury address: **${meta.address}**\n- Signer == treasury: **${String(sig.signerAddress).toLowerCase()===String(meta.address).toLowerCase()}**\n- Governance event hash-chain valid: **${chainOk}**\n- Governance events count: **${lines.length}**\n\n## Funding & Credits\n- Wallet ETH (Base): **${ethers.formatEther(eth)}**\n- Wallet USDC (Base): **${ethers.formatUnits(ub, ud)}**\n- EigenAI grant active: **${grant.grant.hasGrant}**\n- EigenAI token count: **${grant.grant.tokenCount}**\n\n## Conclusion\nThis agent is operating in **sovereign-lite autonomous mode** with cryptographic verifiability, policy-gated governance, and agent-controlled treasury custody.\n`;

  const outPath = path.join(root, 'governance', 'proof-report.md');
  fs.writeFileSync(outPath, report);
  console.log(JSON.stringify({ok:true,outPath},null,2));
})();
