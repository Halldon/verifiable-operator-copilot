const test = require('node:test');
const assert = require('node:assert/strict');

const {
  stateLabel,
  normalizeRequiredStates,
  checkGovernorState
} = require('../src/governance_contract_checks');

test('state labels map expected OpenZeppelin governor values', () => {
  assert.equal(stateLabel(5), 'Queued');
  assert.equal(stateLabel(7), 'Executed');
  assert.equal(stateLabel(99), 'Unknown(99)');
});

test('normalize required states defaults to Executed', () => {
  assert.deepEqual(normalizeRequiredStates([]), [7]);
  assert.deepEqual(normalizeRequiredStates(['5', '7']), [5, 7]);
});

test('contract check dry-run skips when rpc missing', async () => {
  const result = await checkGovernorState({
    policyConfig: {
      chainId: 8453,
      governorAddress: '0x0000000000000000000000000000000000000001',
      rpcEnv: 'INTENTIONALLY_MISSING_ENV',
      requiredStates: [7]
    },
    proposalId: '1',
    dryRun: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
});
