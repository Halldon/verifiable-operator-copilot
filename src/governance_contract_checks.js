const { ethers } = require('ethers');

const OZ_GOVERNOR_STATES = {
  0: 'Pending',
  1: 'Active',
  2: 'Canceled',
  3: 'Defeated',
  4: 'Succeeded',
  5: 'Queued',
  6: 'Expired',
  7: 'Executed'
};

function stateLabel(value) {
  if (value === undefined || value === null) return 'unknown';
  const n = Number(value);
  return OZ_GOVERNOR_STATES[n] || `Unknown(${n})`;
}

function normalizeRequiredStates(required) {
  if (!Array.isArray(required) || required.length === 0) {
    return [7];
  }
  return required.map((x) => Number(x));
}

function parseUint(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string' && value.startsWith('0x')) return BigInt(value);
  return BigInt(String(value));
}

function resolveRpcUrl(policyConfig = {}) {
  const envName = policyConfig.rpcEnv || 'BASE_RPC_URL';
  const direct = policyConfig.rpcUrl || '';
  const fromEnv = process.env[envName] || '';
  return { rpcUrl: direct || fromEnv, envName };
}

async function checkGovernorState({ policyConfig, proposalId, dryRun = false }) {
  if (!proposalId && proposalId !== 0) {
    throw new Error('Missing onchain contract proposalId');
  }

  const requiredStates = normalizeRequiredStates(policyConfig?.requiredStates);
  const governor = policyConfig?.governorAddress;
  if (!governor) {
    if (dryRun) {
      return {
        ok: true,
        skipped: true,
        reason: 'Governor address not configured',
        requiredStates,
        requiredStateLabels: requiredStates.map(stateLabel)
      };
    }
    throw new Error('Missing governance.contractAuthority.governorAddress');
  }
  const { rpcUrl, envName } = resolveRpcUrl(policyConfig);

  if (!rpcUrl) {
    if (dryRun) {
      return {
        ok: true,
        skipped: true,
        reason: `RPC URL not configured (${envName})`,
        requiredStates,
        requiredStateLabels: requiredStates.map(stateLabel)
      };
    }
    throw new Error(`Missing RPC URL. Set ${envName} or governance.contractAuthority.rpcUrl`);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl, policyConfig.chainId || undefined);
  const governorAbi = [
    'function state(uint256 proposalId) view returns (uint8)'
  ];

  const c = new ethers.Contract(governor, governorAbi, provider);
  const stateRaw = await c.state(parseUint(proposalId));
  const stateNumber = Number(stateRaw);
  const matches = requiredStates.includes(stateNumber);

  return {
    ok: matches,
    skipped: false,
    governor,
    chainId: policyConfig.chainId,
    proposalId: String(proposalId),
    observedState: stateNumber,
    observedStateLabel: stateLabel(stateNumber),
    requiredStates,
    requiredStateLabels: requiredStates.map(stateLabel)
  };
}

module.exports = {
  OZ_GOVERNOR_STATES,
  stateLabel,
  normalizeRequiredStates,
  checkGovernorState,
  resolveRpcUrl
};
