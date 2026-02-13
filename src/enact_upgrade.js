#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { approvalsDir, proposalsDir, readPolicy, appendEvent } = require('./governance_common');

const args = process.argv.slice(2);
const get = (k, d='') => { const i=args.indexOf(k); return i>=0 ? args[i+1] : d; };

const proposalId = get('--proposal');
if (!proposalId) throw new Error('Usage: --proposal <id>');

const proposalPath = path.join(proposalsDir, `${proposalId}.json`);
if (!fs.existsSync(proposalPath)) throw new Error('Proposal not found');
const proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8'));

const policy = readPolicy();
const files = fs.existsSync(approvalsDir) ? fs.readdirSync(approvalsDir) : [];
const approvals = files
  .filter(f => f.startsWith(`${proposalId}.`) && f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(approvalsDir, f), 'utf8')));

const uniqueApprovers = [...new Set(approvals.map(a => a.approver).filter(a => policy.governance.approvers.includes(a)))];
if (uniqueApprovers.length < policy.governance.threshold) throw new Error(`Not enough approvals: ${uniqueApprovers.length}/${policy.governance.threshold}`);
if (Date.now() < new Date(proposal.effectiveAfter).getTime()) throw new Error(`Timelock active until ${proposal.effectiveAfter}`);

proposal.status = 'enacted';
proposal.enactedAt = new Date().toISOString();
proposal.enactedByApprovers = uniqueApprovers;
fs.writeFileSync(proposalPath, JSON.stringify(proposal, null, 2));
appendEvent({ type: 'proposal_enacted', proposalId, approvers: uniqueApprovers });
console.log(JSON.stringify({ ok:true, proposalId, enactedBy: uniqueApprovers }, null, 2));
