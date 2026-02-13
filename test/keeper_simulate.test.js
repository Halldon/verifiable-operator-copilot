const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function runKeeper(policyPath, requestPath) {
  const out = execFileSync('node', [
    'src/keeper_simulate.js',
    '--policy', path.relative(root, policyPath),
    '--request', path.relative(root, requestPath)
  ], { cwd: root, encoding: 'utf8' });
  return JSON.parse(out);
}

test('keeper simulation accepts eligible nonce-ordered request', () => {
  const tmpDir = path.join(__dirname, '.tmp-keeper');
  fs.mkdirSync(tmpDir, { recursive: true });

  const policyPath = path.join(tmpDir, 'policy.json');
  const registryPath = path.join(tmpDir, 'registry.json');
  const statePath = path.join(tmpDir, 'state.json');
  const requestPath = path.join(tmpDir, 'request.json');

  fs.writeFileSync(policyPath, JSON.stringify({
    version: 'test',
    eligibility: {
      mode: 'permissionless-stake-threshold',
      minStake: '1000',
      registryPath: path.relative(root, registryPath),
      disallowSlashed: true
    },
    antiReplay: {
      statePath: path.relative(root, statePath),
      enforceStrictNonceIncrement: true,
      maxSkewSeconds: 600
    },
    boundedActions: {
      anchor_provenance: {
        maxCalldataBytes: 128,
        allowedChains: [8453]
      }
    }
  }, null, 2));

  fs.writeFileSync(registryPath, JSON.stringify({
    keepers: {
      '0x1000000000000000000000000000000000000001': {
        stake: '5000',
        slashed: false
      }
    }
  }, null, 2));

  fs.writeFileSync(requestPath, JSON.stringify({
    keeper: '0x1000000000000000000000000000000000000001',
    nonce: 1,
    action: 'anchor_provenance',
    expiresAt: '2030-01-01T00:00:00.000Z',
    params: {
      chainId: 8453,
      digest: '0x1111111111111111111111111111111111111111111111111111111111111111'
    }
  }, null, 2));

  const result = runKeeper(policyPath, requestPath);
  assert.equal(result.ok, true);
  assert.equal(result.checks.eligibility, true);
});
