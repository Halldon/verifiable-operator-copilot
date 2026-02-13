#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  proposalsDir,
  ensureDirs,
  readPolicy,
  nowIso,
  sha,
  appendEvent
} = require('./governance_common');
const { checkGovernorState } = require('./governance_contract_checks');

const args = process.argv.slice(2);
const get = (k, d='') => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);

(async () => {
  const policy = readPolicy();
  const governance = policy.governance || {};
  const authorityMode = get('--authority-mode', governance.authorityMode || 'local-threshold');

  const proposalId = 'prop-' + Date.now();
  const title = get('--title', 'Upgrade proposal');
  const targetPath = get('--target', 'src/run_agent.js');
  const reason = get('--reason', 'Routine upgrade');
  const timelock = Number(get('--timelock-seconds', String(governance.defaultTimelockSeconds || 3600)));
  const contractProposalId = get('--contract-proposal-id', '');
  const contractProposalTx = get('--contract-proposal-tx', '');

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
    authorityMode,
    effectiveAfter: new Date(Date.now() + timelock * 1000).toISOString(),
    status: authorityMode === 'contract' ? 'pending_onchain' : 'pending'
  };

  if (authorityMode === 'contract') {
    const contractPolicy = governance.contractAuthority || {};
    proposal.contractAuthority = {
      chainId: contractPolicy.chainId,
      governorAddress: contractPolicy.governorAddress || '',
      timelockAddress: contractPolicy.timelockAddress || '',
      contractProposalId: contractProposalId || null,
      contractProposalTx: contractProposalTx || null,
      requiredStates: contractPolicy.requiredStates || [7]
    };

    if (contractProposalId) {
      const check = await checkGovernorState({
        policyConfig: contractPolicy,
        proposalId: contractProposalId,
        dryRun: has('--skip-contract-check') || has('--dry-run')
      });
      proposal.contractAuthority.initialStateCheck = check;
    }
  }

  ensureDirs();
  const p = path.join(proposalsDir, `${proposalId}.json`);
  fs.writeFileSync(p, JSON.stringify(proposal, null, 2));
  appendEvent({
    type: 'proposal_created',
    proposalId,
    title,
    targetPath,
    codeHash,
    timelockSeconds: timelock,
    authorityMode,
    contractProposalId: contractProposalId || null
  });

  console.log(JSON.stringify({ ok: true, proposalId, authorityMode, path: p, effectiveAfter: proposal.effectiveAfter }, null, 2));
})();
