#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { verifyMessage } = require('ethers');
const { approvalsDir, proposalsDir, readPolicy, appendEvent } = require('./governance_common');
const { checkGovernorState } = require('./governance_contract_checks');

const args = process.argv.slice(2);
const get = (k, d='') => { const i=args.indexOf(k); return i>=0 ? args[i+1] : d; };
const has = (k) => args.includes(k);

const proposalId = get('--proposal');
if (!proposalId) throw new Error('Usage: --proposal <id> [--dry-run]');

const proposalPath = path.join(proposalsDir, `${proposalId}.json`);
if (!fs.existsSync(proposalPath)) throw new Error('Proposal not found');
const proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8'));

const policy = readPolicy();
const authorityMode = proposal.authorityMode || policy.governance?.authorityMode || 'local-threshold';

async function enactContractMode() {
  const contractPolicy = policy.governance?.contractAuthority || {};
  const onchainProposalId =
    get('--contract-proposal-id', '') ||
    proposal.contractAuthority?.contractProposalId ||
    null;

  if (!onchainProposalId) {
    throw new Error('Contract mode requires contract proposal id. Pass --contract-proposal-id or set it in proposal artifact.');
  }

  const check = await checkGovernorState({
    policyConfig: contractPolicy,
    proposalId: onchainProposalId,
    dryRun: has('--dry-run')
  });

  if (!check.ok && !check.skipped) {
    throw new Error(`Governor state check failed: observed ${check.observedStateLabel}, required ${check.requiredStateLabels.join(', ')}`);
  }

  if (has('--dry-run')) {
    return {
      ok: true,
      mode: 'contract',
      proposalId,
      onchainCheck: check,
      note: 'dry-run only, proposal file not mutated'
    };
  }

  proposal.status = 'enacted';
  proposal.enactedAt = new Date().toISOString();
  proposal.enactedBy = 'onchain_governor';
  proposal.contractAuthority = {
    ...(proposal.contractAuthority || {}),
    contractProposalId: String(onchainProposalId),
    enactmentCheck: check
  };
  fs.writeFileSync(proposalPath, JSON.stringify(proposal, null, 2));
  appendEvent({
    type: 'proposal_enacted',
    proposalId,
    authorityMode: 'contract',
    contractProposalId: String(onchainProposalId),
    governorState: check.observedState,
    governorStateLabel: check.observedStateLabel
  });

  return { ok: true, mode: 'contract', proposalId, onchainCheck: check };
}

function enactLocalThresholdMode() {
  const addrMap = policy.governance.approverAddresses || {};
  const files = fs.existsSync(approvalsDir) ? fs.readdirSync(approvalsDir) : [];
  const approvals = files
    .filter(f => f.startsWith(`${proposalId}.`) && f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(approvalsDir, f), 'utf8')));

  const expectedMessage = `approve:${proposal.proposalId}:${proposal.codeHash}:${proposal.effectiveAfter}`;
  const validApprovals = approvals.filter(a => {
    if (!addrMap[a.approver]) return false;
    if (a.message !== expectedMessage) return false;
    try {
      const recovered = verifyMessage(a.message, a.signature);
      return recovered.toLowerCase() === String(addrMap[a.approver]).toLowerCase();
    } catch {
      return false;
    }
  });

  const uniqueApprovers = [...new Set(validApprovals.map(a => a.approver))];
  if (uniqueApprovers.length < policy.governance.threshold) {
    throw new Error(`Not enough valid signed approvals: ${uniqueApprovers.length}/${policy.governance.threshold}`);
  }
  if (Date.now() < new Date(proposal.effectiveAfter).getTime()) {
    throw new Error(`Timelock active until ${proposal.effectiveAfter}`);
  }

  if (has('--dry-run')) {
    return {
      ok: true,
      mode: 'local-threshold',
      proposalId,
      validApprovers: uniqueApprovers,
      note: 'dry-run only, proposal file not mutated'
    };
  }

  proposal.status = 'enacted';
  proposal.enactedAt = new Date().toISOString();
  proposal.enactedByApprovers = uniqueApprovers;
  proposal.enactedWithSignedThreshold = true;
  fs.writeFileSync(proposalPath, JSON.stringify(proposal, null, 2));
  appendEvent({ type: 'proposal_enacted', proposalId, approvers: uniqueApprovers, signedThreshold: true, authorityMode: 'local-threshold' });
  return { ok: true, mode: 'local-threshold', proposalId, enactedBy: uniqueApprovers };
}

(async () => {
  const result = authorityMode === 'contract'
    ? await enactContractMode()
    : enactLocalThresholdMode();

  console.log(JSON.stringify(result, null, 2));
})();
