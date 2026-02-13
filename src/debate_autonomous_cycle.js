#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { appendEvent } = require('./governance_common');
const {
  root,
  nowIso,
  ensureDir,
  parseArgs,
  loadDebatePolicy,
  readJson,
  writeJson
} = require('./debate_common');

function runDebate(inputPath, opts = {}) {
  const args = ['src/debate_run.js', '--input', inputPath];
  if (opts.seed !== undefined) args.push('--seed', String(opts.seed));
  if (opts.model) args.push('--model', String(opts.model));
  if (opts.runId) args.push('--run-id', String(opts.runId));
  const proc = spawnSync('node', args, { cwd: root, encoding: 'utf8' });
  return proc;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const policy = loadDebatePolicy();

  const inboxDir = path.resolve(root, policy.runtime.inboxDir);
  const processedDir = path.resolve(root, policy.runtime.processedDir);
  const failedDir = path.resolve(root, policy.runtime.failedDir);
  ensureDir(inboxDir);
  ensureDir(processedDir);
  ensureDir(failedDir);

  const maxRuns = Number(args['max-runs'] || policy?.limits?.maxRunsPerAutonomousCycle || 1);
  const files = fs.readdirSync(inboxDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const picked = files.slice(0, maxRuns);
  const summary = {
    startedAt: nowIso(),
    mode: 'autonomous-debate-cycle',
    maxRuns,
    inboxCount: files.length,
    processed: [],
    failed: []
  };

  for (const file of picked) {
    const full = path.join(inboxDir, file);
    const req = readJson(full);
    const proc = runDebate(path.relative(root, full), {
      seed: req.seed,
      model: req.model,
      runId: req.runId || `auto-${Date.now()}-${path.basename(file, '.json')}`
    });

    if (proc.status === 0) {
      const out = JSON.parse((proc.stdout || '{}').trim() || '{}');
      summary.processed.push({ file, runId: out.runId, bundlePath: out.bundlePath });
      fs.renameSync(full, path.join(processedDir, file));
      appendEvent({
        type: 'debate_autonomous_processed',
        queueFile: `artifacts/debate/inbox/${file}`,
        runId: out.runId,
        bundlePath: out.bundlePath
      });
    } else {
      summary.failed.push({ file, exitCode: proc.status, stderr: (proc.stderr || '').slice(0, 1200) });
      fs.renameSync(full, path.join(failedDir, file));
      appendEvent({
        type: 'debate_autonomous_failed',
        queueFile: `artifacts/debate/inbox/${file}`,
        exitCode: proc.status
      });
    }
  }

  summary.finishedAt = nowIso();
  summary.ok = summary.failed.length === 0;
  const outPath = path.join(root, 'governance', 'debate-autonomy-state.json');
  writeJson(outPath, summary);
  console.log(JSON.stringify({ ok: summary.ok, statePath: path.relative(root, outPath), processed: summary.processed.length, failed: summary.failed.length }, null, 2));
  if (!summary.ok) process.exit(1);
}

try {
  main();
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }, null, 2));
  process.exit(1);
}
