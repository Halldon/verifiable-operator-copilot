#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { buildReceiptCore, signReceiptCore } = require('./receipt_common');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const get = (k, d='') => { const i=args.indexOf(k); return i>=0 ? args[i+1] : d; };

const inputPath = path.resolve(root, get('--input'));
const codePath = path.resolve(root, get('--code'));
const outputPath = path.resolve(root, get('--output'));
const operation = get('--operation', 'unknown_operation');
const outPath = path.resolve(root, get('--out', path.join('artifacts', `execution-receipt-${Date.now()}.json`)));
const attestationUri = get('--attestation-uri', '');
const attestationType = get('--attestation-type', '');
const attestationTx = get('--attestation-tx', '');

if (!get('--input') || !get('--code') || !get('--output')) {
  throw new Error('Usage: --input <file> --code <file> --output <file> [--operation name] [--out file]');
}

const privateKey = get('--private-key', process.env.RECEIPT_SIGNER_PRIVATE_KEY || '');
if (!privateKey) {
  throw new Error('Missing signer key. Set --private-key or RECEIPT_SIGNER_PRIVATE_KEY');
}

(async () => {
  const attestation = (attestationUri || attestationType || attestationTx)
    ? {
        type: attestationType || 'external',
        uri: attestationUri || null,
        txHash: attestationTx || null
      }
    : null;

  const core = buildReceiptCore({
    operation,
    inputPath,
    codePath,
    outputPath,
    attestation,
    metadata: {
      generatedBy: 'src/generate_execution_receipt.js'
    }
  });

  const bundle = await signReceiptCore(core, privateKey);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2));

  console.log(JSON.stringify({
    ok: true,
    outPath,
    receiptHash: bundle.receiptHash,
    signer: bundle.signer.address,
    hashes: bundle.hashes
  }, null, 2));
})();
