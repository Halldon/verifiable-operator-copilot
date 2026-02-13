#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { approvalsDir, proposalsDir, ensureDirs, readPolicy, nowIso, appendEvent } = require('./governance_common');

const args = process.argv.slice(2);
const get = (k, d='') => { const i=args.indexOf(k); return i>=0 ? args[i+1] : d; };

const proposalId = get('--proposal');
const approver = get('--approver');
if (!proposalId || !approver) throw new Error('Usage: --proposal <id> --approver <name>');

const policy = readPolicy();
if (!policy.governance.approvers.includes(approver)) throw new Error('Approver not allowed by policy');

const proposalPath = path.join(proposalsDir, `${proposalId}.json`);
if (!fs.existsSync(proposalPath)) throw new Error('Proposal not found');

ensureDirs();
const out = path.join(approvalsDir, `${proposalId}.${approver}.json`);
const approval = { proposalId, approver, approvedAt: nowIso() };
fs.writeFileSync(out, JSON.stringify(approval, null, 2));
appendEvent({ type: 'proposal_approved', proposalId, approver });
console.log(JSON.stringify({ ok:true, proposalId, approver, path: out }, null, 2));
