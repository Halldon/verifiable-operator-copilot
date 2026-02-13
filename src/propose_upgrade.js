#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { proposalsDir, ensureDirs, readPolicy, nowIso, sha, appendEvent } = require('./governance_common');

const args = process.argv.slice(2);
const get = (k, d='') => { const i=args.indexOf(k); return i>=0 ? args[i+1] : d; };

const proposalId = 'prop-' + Date.now();
const title = get('--title', 'Upgrade proposal');
const targetPath = get('--target', 'src/run_agent.js');
const reason = get('--reason', 'Routine upgrade');
const timelock = Number(get('--timelock-seconds', String(readPolicy().governance.defaultTimelockSeconds)));

const abs = path.resolve(path.join(__dirname, '..'), targetPath);
if (!fs.existsSync(abs)) throw new Error(`Target not found: ${targetPath}`);
const codeHash = sha(fs.readFileSync(abs));

const proposal = {
  proposalId,
  title,
  reason,
  targetPath,
  codeHash,
  createdAt: nowIso(),
  effectiveAfter: new Date(Date.now() + timelock * 1000).toISOString(),
  status: 'pending'
};

ensureDirs();
const p = path.join(proposalsDir, `${proposalId}.json`);
fs.writeFileSync(p, JSON.stringify(proposal, null, 2));
appendEvent({ type: 'proposal_created', proposalId, title, targetPath, codeHash, timelockSeconds: timelock });
console.log(JSON.stringify({ ok:true, proposalId, path:p, effectiveAfter: proposal.effectiveAfter }, null, 2));
