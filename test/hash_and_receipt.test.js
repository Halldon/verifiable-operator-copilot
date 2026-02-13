const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Wallet } = require('ethers');

const { canonicalize, sha256Hex } = require('../src/hash_utils');
const { buildReceiptCore, signReceiptCore, verifyReceiptBundle } = require('../src/receipt_common');

test('canonicalize is deterministic regardless of key order', () => {
  const a = { b: 2, a: 1, nested: { z: true, y: false } };
  const b = { nested: { y: false, z: true }, a: 1, b: 2 };
  assert.equal(canonicalize(a), canonicalize(b));
  assert.equal(sha256Hex(a), sha256Hex(b));
});

test('execution receipt signs and verifies', async () => {
  const tmpDir = path.join(__dirname, '.tmp-receipt');
  fs.mkdirSync(tmpDir, { recursive: true });

  const inputPath = path.join(tmpDir, 'input.json');
  const outputPath = path.join(tmpDir, 'output.json');
  const codePath = path.join(__dirname, '..', 'src', 'run_agent.js');
  fs.writeFileSync(inputPath, JSON.stringify({ q: 'input' }));
  fs.writeFileSync(outputPath, JSON.stringify({ a: 'output' }));

  const core = buildReceiptCore({
    operation: 'unit_test',
    inputPath,
    codePath,
    outputPath,
    attestation: null,
    metadata: { test: true }
  });

  const signer = Wallet.createRandom();
  const bundle = await signReceiptCore(core, signer.privateKey);
  const verified = verifyReceiptBundle(bundle);

  assert.equal(verified.ok, true);
  assert.equal(bundle.signer.address.toLowerCase(), signer.address.toLowerCase());
});
