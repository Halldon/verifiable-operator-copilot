#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Wallet } = require('ethers');
const { approvalsDir, proposalsDir, ensureDirs, readPolicy, nowIso, appendEvent } = require('./governance_common');

const args = process.argv.slice(2);
const get = (k, d='') => { const i=args.indexOf(k); return i>=0 ? args[i+1] : d; };

const proposalId = get('--proposal');
const approver = get('--approver');
if (!proposalId || !approver) throw new Error('Usage: --proposal <id> --approver <name>');

const policy = readPolicy();
const addrMap = policy.governance.approverAddresses || {};
if (!addrMap[approver]) throw new Error('Approver not allowed by policy/addresses');

const proposalPath = path.join(proposalsDir, `${proposalId}.json`);
if (!fs.existsSync(proposalPath)) throw new Error('Proposal not found');

const proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8'));
const message = `approve:${proposal.proposalId}:${proposal.codeHash}:${proposal.effectiveAfter}`;

const secretsPath = path.join(path.resolve(__dirname, '..'), 'governance', 'approver-local-secrets.json');
if (!fs.existsSync(secretsPath)) throw new Error('Missing local approver key file. Run bootstrap_approvers.js first.');
const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
const key = secrets.approvers?.[approver]?.privateKey;
if (!key) throw new Error(`No key for approver ${approver}`);
const wallet = new Wallet(key);
if (wallet.address.toLowerCase() !== addrMap[approver].toLowerCase()) throw new Error('Approver key/address mismatch');

(async()=>{
  const signature = await wallet.signMessage(message);
  ensureDirs();
  const out = path.join(approvalsDir, `${proposalId}.${approver}.json`);
  const approval = { proposalId, approver, approverAddress: wallet.address, approvedAt: nowIso(), message, signature };
  fs.writeFileSync(out, JSON.stringify(approval, null, 2));
  appendEvent({ type: 'proposal_approved', proposalId, approver, approverAddress: wallet.address });
  console.log(JSON.stringify({ ok:true, proposalId, approver, path: out }, null, 2));
})();
