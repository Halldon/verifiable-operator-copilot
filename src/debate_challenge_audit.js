#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  root,
  nowIso,
  ensureDir,
  parseArgs,
  readJson,
  writeJson
} = require('./debate_common');

function runNode(args) {
  return spawnSync('node', args, { cwd: root, encoding: 'utf8' });
}

function mustRunNode(args, label) {
  const proc = runNode(args);
  if (proc.status !== 0) {
    const err = new Error(`${label} failed (exit ${proc.status})`);
    err.stdout = proc.stdout;
    err.stderr = proc.stderr;
    throw err;
  }
  return proc;
}

function runDebate({ inputRelPath, seed, runId, outDirRel }) {
  mustRunNode([
    'src/debate_run.js',
    '--input', inputRelPath,
    '--seed', String(seed),
    '--run-id', runId,
    '--out-dir', outDirRel
  ], `debate_run:${runId}`);
  const bundlePath = path.join(root, outDirRel, runId, 'verifiability_bundle.json');
  return readJson(bundlePath);
}

function fmtBool(v) {
  return v ? 'PASS' : 'FAIL';
}

function buildMarkdown(report) {
  const rows = report.checks
    .map((c) => `| ${c.requirement} | ${c.pass ? '✅ PASS' : '❌ FAIL'} | ${c.evidence} |`)
    .join('\n');

  const runRows = report.runs
    .map((r) => `| ${r.label} | ${r.runId} | ${r.seed} | ${r.winnerId} | \`${r.outputHash}\` |`)
    .join('\n');

  return `# Verifiable Debate Arena — Challenge Readiness Audit

Generated: ${report.generatedAt}
Workspace: \`${report.workspace}\`

## Test scope
- Clean-state directory reset: \`${report.cleanStatePath}\`
- Sample input: \`${report.sampleInput}\`
- Model: \`${report.model}\`
- Deterministic seed baseline: \`${report.baselineSeed}\`

## Verification results
| Requirement | Status | Evidence |
|---|---|---|
${rows}

## Deterministic proof runs
| Label | Run ID | Seed | Winner | Output Hash |
|---|---:|---:|---|---|
${runRows}

## Grant & token evidence
- Grant before first run: hasGrant=**${report.grantEvidence.beforeHasGrant}**, tokenCount=**${report.grantEvidence.beforeTokens}**
- Grant after last run: hasGrant=**${report.grantEvidence.afterHasGrant}**, tokenCount=**${report.grantEvidence.afterTokens}**
- Aggregate token delta across runs: **${report.grantEvidence.aggregateTokenDelta}**
- Aggregate model-reported tokens used: **${report.grantEvidence.aggregateUsageTokens}**

## Residual risks
- API/model availability remains an external dependency.
- Eigen response signature is captured and persisted, but full onchain signer recovery is not re-computed in this script (documented in challenge mapping and verifiability bundle).
- Token accounting depends on upstream grant accounting freshness.
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outBaseRel = args['out-dir'] || 'artifacts/debate/challenge-audit/latest';
  const outBase = path.resolve(root, outBaseRel);
  const runsRel = path.join(outBaseRel, 'runs');
  const runsAbs = path.join(outBase, 'runs');
  const sampleInputRel = args.input || 'demo/debate_sample.json';
  const sampleInputAbs = path.resolve(root, sampleInputRel);
  const baselineSeed = Number(args.seed || 2026);
  const negativeSeed = Number(args['negative-seed'] || baselineSeed + 1);

  if (!fs.existsSync(sampleInputAbs)) {
    throw new Error(`Missing sample input at ${sampleInputRel}`);
  }

  fs.rmSync(outBase, { recursive: true, force: true });
  ensureDir(runsAbs);

  const runMain = runDebate({ inputRelPath: sampleInputRel, seed: baselineSeed, runId: 'main', outDirRel: runsRel });
  mustRunNode(['src/debate_verify.js', '--bundle', path.join(runsRel, 'main', 'verifiability_bundle.json')], 'debate_verify:main');

  const runReplay1 = runDebate({ inputRelPath: sampleInputRel, seed: baselineSeed, runId: 'replay-1', outDirRel: runsRel });
  const runReplay2 = runDebate({ inputRelPath: sampleInputRel, seed: baselineSeed, runId: 'replay-2', outDirRel: runsRel });
  const runNegative = runDebate({ inputRelPath: sampleInputRel, seed: negativeSeed, runId: 'negative-seed', outDirRel: runsRel });

  const model = runMain.inference.model;
  const sameHashReplay1 = runMain.output.hashSha256 === runReplay1.output.hashSha256;
  const sameHashReplay2 = runMain.output.hashSha256 === runReplay2.output.hashSha256;
  const negativeDiff = runMain.output.hashSha256 !== runNegative.output.hashSha256;

  const aggregateTokenDelta = [runMain, runReplay1, runReplay2, runNegative]
    .map((r) => Number(r?.grantEvidence?.tokenDelta || 0))
    .reduce((sum, v) => sum + v, 0);

  const aggregateUsageTokens = [runMain, runReplay1, runReplay2, runNegative]
    .map((r) => Number(r?.grantEvidence?.usageTotalTokens || 0))
    .reduce((sum, v) => sum + v, 0);

  const checks = [
    {
      requirement: 'Clean-state top-to-bottom run completes',
      pass: true,
      evidence: `Reset ${outBaseRel} then executed 4 full runs`
    },
    {
      requirement: 'Deterministic replay check #1',
      pass: sameHashReplay1,
      evidence: `main=${runMain.output.hashSha256} replay-1=${runReplay1.output.hashSha256}`
    },
    {
      requirement: 'Deterministic replay check #2',
      pass: sameHashReplay2,
      evidence: `main=${runMain.output.hashSha256} replay-2=${runReplay2.output.hashSha256}`
    },
    {
      requirement: 'Negative check (changed seed changes result)',
      pass: negativeDiff,
      evidence: `main=${runMain.output.hashSha256} negative=${runNegative.output.hashSha256}`
    },
    {
      requirement: 'Grant token check + usage evidence present',
      pass: Boolean(runMain.grantEvidence.before?.hasGrant && aggregateUsageTokens > 0),
      evidence: `beforeHasGrant=${runMain.grantEvidence.before?.hasGrant} aggregateUsageTokens=${aggregateUsageTokens} aggregateTokenDelta=${aggregateTokenDelta}`
    },
    {
      requirement: 'Signed verdict artifact verifies',
      pass: true,
      evidence: 'debate_verify.js passed for baseline run'
    }
  ];

  const report = {
    generatedAt: nowIso(),
    workspace: root,
    cleanStatePath: outBaseRel,
    sampleInput: sampleInputRel,
    model,
    baselineSeed,
    checks,
    runs: [
      { label: 'baseline', runId: 'main', seed: baselineSeed, winnerId: readJson(path.resolve(root, runMain.output.verdictPath)).deterministicVerdict.winnerId, outputHash: runMain.output.hashSha256 },
      { label: 'replay-1', runId: 'replay-1', seed: baselineSeed, winnerId: readJson(path.resolve(root, runReplay1.output.verdictPath)).deterministicVerdict.winnerId, outputHash: runReplay1.output.hashSha256 },
      { label: 'replay-2', runId: 'replay-2', seed: baselineSeed, winnerId: readJson(path.resolve(root, runReplay2.output.verdictPath)).deterministicVerdict.winnerId, outputHash: runReplay2.output.hashSha256 },
      { label: 'negative-seed', runId: 'negative-seed', seed: negativeSeed, winnerId: readJson(path.resolve(root, runNegative.output.verdictPath)).deterministicVerdict.winnerId, outputHash: runNegative.output.hashSha256 }
    ],
    grantEvidence: {
      beforeHasGrant: Boolean(runMain.grantEvidence.before?.hasGrant),
      afterHasGrant: Boolean(runNegative.grantEvidence.after?.hasGrant),
      beforeTokens: Number(runMain.grantEvidence.before?.tokenCount || 0),
      afterTokens: Number(runNegative.grantEvidence.after?.tokenCount || 0),
      aggregateTokenDelta,
      aggregateUsageTokens
    }
  };

  const reportJsonPath = path.join(outBase, 'challenge_audit_report.json');
  writeJson(reportJsonPath, report);

  const markdown = buildMarkdown(report);
  const mdPath = path.join(root, 'docs', 'challenge_readiness_audit.md');
  fs.writeFileSync(mdPath, markdown);

  const allPass = checks.every((c) => c.pass);
  console.log(JSON.stringify({
    ok: allPass,
    reportJsonPath: path.relative(root, reportJsonPath),
    reportMarkdownPath: path.relative(root, mdPath),
    deterministicHash: runMain.output.hashSha256,
    negativeHash: runNegative.output.hashSha256,
    checks: checks.map((c) => ({ requirement: c.requirement, status: fmtBool(c.pass) }))
  }, null, 2));

  if (!allPass) process.exit(1);
}

try {
  main();
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    error: String(err.message || err),
    stdout: err.stdout || null,
    stderr: err.stderr || null
  }, null, 2));
  process.exit(1);
}
