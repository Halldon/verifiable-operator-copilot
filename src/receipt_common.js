const fs = require('fs');
const { verifyMessage, Wallet } = require('ethers');
const { canonicalize, sha256Hex } = require('./hash_utils');

function hashFile(path) {
  return sha256Hex(fs.readFileSync(path));
}

function buildReceiptCore({ operation, inputPath, codePath, outputPath, attestation = null, metadata = {} }) {
  return {
    schema: 'voc.execution.receipt.v1',
    createdAt: new Date().toISOString(),
    operation,
    hashes: {
      inputSha256: hashFile(inputPath),
      codeSha256: hashFile(codePath),
      outputSha256: hashFile(outputPath)
    },
    references: {
      inputPath,
      codePath,
      outputPath
    },
    attestation,
    metadata
  };
}

async function signReceiptCore(core, privateKey) {
  const wallet = new Wallet(privateKey);
  const coreHash = sha256Hex(canonicalize(core));
  const message = `verifiable_execution_receipt:${coreHash}`;
  const signature = await wallet.signMessage(message);
  return {
    ...core,
    coreHash,
    signer: {
      scheme: 'eip191',
      address: wallet.address,
      message,
      signature
    },
    receiptHash: sha256Hex(canonicalize({ ...core, coreHash, signerAddress: wallet.address }))
  };
}

function verifyReceiptBundle(bundle, options = {}) {
  const requiredPaths = options.paths || bundle.references || {};

  const recomputedCore = {
    schema: bundle.schema,
    createdAt: bundle.createdAt,
    operation: bundle.operation,
    hashes: {
      inputSha256: hashFile(requiredPaths.inputPath),
      codeSha256: hashFile(requiredPaths.codePath),
      outputSha256: hashFile(requiredPaths.outputPath)
    },
    references: requiredPaths,
    attestation: bundle.attestation || null,
    metadata: bundle.metadata || {}
  };

  const recomputedCoreHash = sha256Hex(canonicalize(recomputedCore));
  const expectedMessage = `verifiable_execution_receipt:${recomputedCoreHash}`;
  const recovered = verifyMessage(expectedMessage, bundle.signer?.signature || '0x');

  const checks = {
    hashesMatch: recomputedCore.hashes.inputSha256 === bundle.hashes?.inputSha256
      && recomputedCore.hashes.codeSha256 === bundle.hashes?.codeSha256
      && recomputedCore.hashes.outputSha256 === bundle.hashes?.outputSha256,
    coreHashMatches: recomputedCoreHash === bundle.coreHash,
    messageMatches: expectedMessage === bundle.signer?.message,
    signerMatches: recovered.toLowerCase() === String(bundle.signer?.address || '').toLowerCase()
  };

  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    recovered,
    expectedMessage,
    recomputedCoreHash
  };
}

module.exports = {
  buildReceiptCore,
  signReceiptCore,
  verifyReceiptBundle
};
