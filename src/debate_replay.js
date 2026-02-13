#!/usr/bin/env node
const path = require('path');
const { spawnSync } = require('child_process');
const {
  root,
  parseArgs,
  readJson
} = require('./debate_common');

function usage() {
  console.log('Usage: node src/debate_replay.js --bundle artifacts/debate/runs/<runId>/verifiability_bundle.json [--run-id replay-1] [--out-dir artifacts/debate/runs]');
}

function runNode(args) {
  return spawnSync('node', args, { cwd: root, encoding: 'utf8' });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.bundle) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const bundlePath = path.resolve(root, args.bundle);
  const sourceBundle = readJson(bundlePath);

  const replayRunId = args['run-id'] || `${sourceBundle.runId}-replay-${Date.now()}`;
  const replayOutDir = args['out-dir'] || path.relative(root, path.dirname(path.dirname(bundlePath)));

  const cmd = [
    'src/debate_run.js',
    '--input', sourceBundle.input.path,
    '--seed', String(sourceBundle.inference.seed),
    '--model', sourceBundle.inference.model,
    '--run-id', replayRunId,
    '--out-dir', replayOutDir
  ];

  const proc = runNode(cmd);
  if (proc.status !== 0) {
    console.error(proc.stdout);
    console.error(proc.stderr);
    throw new Error(`Replay run failed with exit ${proc.status}`);
  }

  const replayBundlePath = path.resolve(root, replayOutDir, replayRunId, 'verifiability_bundle.json');
  const replayBundle = readJson(replayBundlePath);
  const sourceVerdict = readJson(path.resolve(root, sourceBundle.output.verdictPath));
  const replayVerdict = readJson(path.resolve(root, replayBundle.output.verdictPath));

  const checks = {
    outputHashMatches: replayBundle.output.hashSha256 === sourceBundle.output.hashSha256,
    winnerMatches: replayVerdict?.deterministicVerdict?.winnerId === sourceVerdict?.deterministicVerdict?.winnerId
  };
  const ok = Object.values(checks).every(Boolean);

  console.log(JSON.stringify({
    ok,
    sourceRunId: sourceBundle.runId,
    replayRunId,
    expectedHash: sourceBundle.output.hashSha256,
    replayHash: replayBundle.output.hashSha256,
    replayBundlePath: path.relative(root, replayBundlePath),
    checks
  }, null, 2));

  if (!ok) process.exit(1);
}

try {
  main();
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }, null, 2));
  process.exit(1);
}
