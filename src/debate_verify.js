#!/usr/bin/env node
const path = require('path');
const { verifyMessage } = require('ethers');
const {
  root,
  readJson,
  stableStringify,
  sha256Hex,
  parseArgs
} = require('./debate_common');

function usage() {
  console.log('Usage: node src/debate_verify.js --bundle artifacts/debate/runs/<runId>/verifiability_bundle.json');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.bundle) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const bundlePath = path.resolve(root, args.bundle);
  const bundle = readJson(bundlePath);
  const verdict = readJson(path.resolve(root, bundle.output.verdictPath));
  const verdictSig = readJson(path.resolve(root, bundle.output.verdictSignaturePath));
  const input = readJson(path.resolve(root, bundle.input.path));

  const recomputedInputHash = sha256Hex(stableStringify(input));
  const recomputedOutputHash = sha256Hex(stableStringify(verdict.deterministicVerdict));
  const recovered = verifyMessage(verdictSig.message, verdictSig.signature);

  const checks = {
    inputHashMatches: recomputedInputHash === bundle.input.hashSha256,
    outputHashMatches: recomputedOutputHash === bundle.output.hashSha256,
    signatureRecovered: recovered.toLowerCase() === String(verdictSig.signerAddress).toLowerCase(),
    signatureSelfConsistent: String(verdictSig.recoveredAddress || '').toLowerCase() === recovered.toLowerCase(),
    winnerPresent: !!verdict?.deterministicVerdict?.winnerId
  };

  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ ok, checks, runId: bundle.runId, winnerId: verdict?.deterministicVerdict?.winnerId }, null, 2));
  if (!ok) process.exit(1);
}

try {
  main();
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }, null, 2));
  process.exit(1);
}
