#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { Wallet } = require('ethers');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'artifacts', 'sovereignty-tests');
fs.mkdirSync(outDir, { recursive: true });

function runNode(script, args = [], options = {}) {
  try {
    const stdout = execFileSync('node', [script, ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, ...(options.env || {}) }
    });
    return { ok: true, stdout: stdout.trim(), json: safeJson(stdout) };
  } catch (err) {
    const stdout = String(err.stdout || '').trim();
    const stderr = String(err.stderr || '').trim();
    return { ok: false, stdout, stderr, code: err.status, json: safeJson(stdout) };
  }
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

const report = {
  generatedAt: new Date().toISOString(),
  checks: {}
};

// 1) Governance contract-mode scaffolding (dry-run enact)
const proposed = runNode('src/propose_upgrade.js', [
  '--title', 'Sovereignty hardening test proposal',
  '--target', 'src/run_agent.js',
  '--reason', 'contract-mode test',
  '--timelock-seconds', '0',
  '--authority-mode', 'contract',
  '--contract-proposal-id', '1',
  '--skip-contract-check'
]);
report.checks.governanceProposeContractMode = proposed;

if (proposed.ok && proposed.json?.proposalId) {
  const enacted = runNode('src/enact_upgrade.js', [
    '--proposal', proposed.json.proposalId,
    '--contract-proposal-id', '1',
    '--dry-run'
  ]);
  report.checks.governanceEnactContractModeDryRun = enacted;
}

// 2) Receipt generate + verify
const receiptInput = path.join(outDir, 'receipt-input.json');
const receiptOutput = path.join(outDir, 'receipt-output.json');
const receiptOutPath = path.join(outDir, 'execution-receipt.json');
fs.writeFileSync(receiptInput, JSON.stringify({ prompt: 'hello' }, null, 2));
fs.writeFileSync(receiptOutput, JSON.stringify({ result: 'world' }, null, 2));

const signer = Wallet.createRandom();
const receiptGen = runNode('src/generate_execution_receipt.js', [
  '--input', path.relative(root, receiptInput),
  '--code', 'src/run_agent.js',
  '--output', path.relative(root, receiptOutput),
  '--operation', 'test_receipt_op',
  '--out', path.relative(root, receiptOutPath),
  '--private-key', signer.privateKey
]);
report.checks.receiptGenerate = receiptGen;

if (receiptGen.ok) {
  const receiptVerify = runNode('src/verify_execution_receipt.js', [
    '--receipt', path.relative(root, receiptOutPath)
  ]);
  report.checks.receiptVerify = receiptVerify;
}

// 3) Keeper simulation
const keeperPolicyPath = path.join(outDir, 'keeper-policy.test.json');
const keeperRegistryPath = path.join(outDir, 'keeper-registry.test.json');
const keeperStatePath = path.join(outDir, 'keeper-state.test.json');
const keeperRequestPath = path.join(outDir, 'keeper-request.test.json');

const keeperPolicy = {
  version: '1.0.0-test',
  eligibility: {
    mode: 'permissionless-stake-threshold',
    minStake: '1000',
    stakeUnit: 'mock-wei',
    registryPath: path.relative(root, keeperRegistryPath),
    disallowSlashed: true
  },
  antiReplay: {
    statePath: path.relative(root, keeperStatePath),
    enforceStrictNonceIncrement: true,
    maxSkewSeconds: 600
  },
  boundedActions: {
    anchor_provenance: {
      maxCalldataBytes: 128,
      allowedChains: [8453]
    }
  }
};
const keeperRegistry = {
  keepers: {
    '0x1000000000000000000000000000000000000001': {
      stake: '5000',
      slashed: false
    }
  }
};
const keeperRequest = {
  keeper: '0x1000000000000000000000000000000000000001',
  nonce: 1,
  action: 'anchor_provenance',
  expiresAt: '2030-01-01T00:00:00.000Z',
  params: {
    chainId: 8453,
    digest: '0x1111111111111111111111111111111111111111111111111111111111111111'
  }
};
fs.writeFileSync(keeperPolicyPath, JSON.stringify(keeperPolicy, null, 2));
fs.writeFileSync(keeperRegistryPath, JSON.stringify(keeperRegistry, null, 2));
fs.writeFileSync(keeperRequestPath, JSON.stringify(keeperRequest, null, 2));

const keeperSim = runNode('src/keeper_simulate.js', [
  '--policy', path.relative(root, keeperPolicyPath),
  '--request', path.relative(root, keeperRequestPath)
]);
report.checks.keeperSimulation = keeperSim;

// 4) Treasury strict-mode unilateral execution block
const treasuryPolicyPath = path.join(outDir, 'treasury-policy.strict.test.json');
const treasuryPolicy = {
  version: '1.1.0-test',
  wallet: { network: 'base', chainId: 8453, custodyMode: 'agent-keystore+keychain-passphrase' },
  sovereignty: {
    mode: 'local-agent-key',
    strictMode: true,
    contractControl: { chainId: 8453, rpcEnv: 'BASE_RPC_URL', rpcUrl: '', authorityContract: '' }
  },
  execution: { preferGasless: false, fallbackOnchain: false },
  limits: {
    maxUsdPerDay: 25,
    maxUsdPerTx: 5,
    allowedRecipients: ['0x581E81C3dc9F558D29dCd9877A828Cd61D7AaAeD']
  },
  autofund: { enabled: false }
};
fs.writeFileSync(treasuryPolicyPath, JSON.stringify(treasuryPolicy, null, 2));

const treasuryBlocked = runNode('src/treasury_execute_transfer.js', [
  '--policy', path.relative(root, treasuryPolicyPath),
  '--recipient', '0x581E81C3dc9F558D29dCd9877A828Cd61D7AaAeD',
  '--rpc', 'http://127.0.0.1:8545',
  '--native', '0.0001'
]);
report.checks.treasuryStrictModeBlocksUnilateral = {
  ok: !treasuryBlocked.ok,
  expectedFailure: true,
  stdout: treasuryBlocked.stdout,
  stderr: treasuryBlocked.stderr,
  code: treasuryBlocked.code
};

// 5) Anchor provenance dry-run
const anchorDryRun = runNode('src/anchor_provenance.js', [
  '--from-file', path.relative(root, receiptOutput),
  '--chain-id', '8453',
  '--dry-run'
]);
report.checks.anchorProvenanceDryRun = anchorDryRun;

report.summary = {
  totalChecks: Object.keys(report.checks).length,
  passedChecks: Object.values(report.checks).filter((v) => v && v.ok).length
};

const reportPath = path.join(outDir, 'test-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, reportPath, summary: report.summary }, null, 2));
