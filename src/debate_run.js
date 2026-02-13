#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { verifyMessage } = require('ethers');
const { loadWallet, checkGrant, runInference } = require('./eigenai_grant_ops');
const { appendEvent, readPolicy } = require('./governance_common');
const {
  root,
  nowIso,
  ensureDir,
  readJson,
  writeJson,
  stableStringify,
  sha256Hex,
  parseArgs,
  loadDebatePolicy,
  normalizeDebateInput,
  enforcePolicyLimits,
  buildJudgePrompt,
  extractVerdictJson,
  normalizeModelVerdict,
  getLatestGovernanceHash
} = require('./debate_common');

function usage() {
  console.log('Usage: node src/debate_run.js --input <debate.json> [--seed 2026] [--model gpt-oss-120b-f16] [--run-id debate-1] [--out-dir artifacts/debate/runs]');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const debatePolicy = loadDebatePolicy();
  const sovereignPolicy = readPolicy();

  const model = String(args.model || debatePolicy?.inference?.defaultModel || 'gpt-oss-120b-f16');
  if (!debatePolicy.inference.allowedModels.includes(model)) {
    throw new Error(`Model '${model}' blocked by policy`);
  }

  const seed = Number(args.seed ?? debatePolicy?.inference?.defaultSeed ?? 2026);
  if (!Number.isInteger(seed)) throw new Error('Seed must be an integer');

  const outDir = path.resolve(root, args['out-dir'] || debatePolicy?.runtime?.runsDir || 'artifacts/debate/runs');
  const runId = String(args['run-id'] || `debate-${Date.now()}`);
  const runDir = path.join(outDir, runId);
  ensureDir(runDir);

  const inputPath = path.resolve(root, args.input);
  if (!fs.existsSync(inputPath)) throw new Error(`Input not found: ${inputPath}`);

  const rawInput = readJson(inputPath);
  const normalizedInput = normalizeDebateInput(rawInput, debatePolicy);
  enforcePolicyLimits(normalizedInput, debatePolicy);

  const canonicalInput = stableStringify(normalizedInput);
  const inputHash = sha256Hex(canonicalInput);

  const prompt = buildJudgePrompt(normalizedInput);
  const promptHash = sha256Hex(prompt);

  const inferenceCfg = {
    model,
    seed,
    temperature: Number(debatePolicy?.inference?.temperature ?? 0),
    max_tokens: Number(debatePolicy?.inference?.maxTokens ?? 1800)
  };

  writeJson(path.join(runDir, 'debate_input.json'), normalizedInput);
  fs.writeFileSync(path.join(runDir, 'judge_prompt.txt'), prompt);
  writeJson(path.join(runDir, 'judge_request_meta.json'), {
    runId,
    inputPath: path.relative(root, inputPath),
    inputHash,
    promptHash,
    inference: inferenceCfg
  });

  const wallet = await loadWallet();
  const grantBefore = await checkGrant(wallet.address);
  if (!grantBefore?.hasGrant) throw new Error('No active EigenAI grant available for wallet');

  const startedAt = nowIso();
  const response = await runInference(wallet, {
    prompt,
    model: inferenceCfg.model,
    seed: inferenceCfg.seed,
    max_tokens: inferenceCfg.max_tokens,
    temperature: inferenceCfg.temperature
  });
  const finishedAt = nowIso();

  const grantAfter = await checkGrant(wallet.address);
  const content = response?.choices?.[0]?.message?.content || '';
  const { jsonText, parsed, rawEnvelope } = extractVerdictJson(content);
  const normalizedVerdict = normalizeModelVerdict(parsed, normalizedInput, debatePolicy);

  const deterministicVerdict = {
    winnerId: normalizedVerdict.winnerId,
    modelWinnerId: normalizedVerdict.modelWinnerId,
    rubric: normalizedVerdict.rubric,
    scores: normalizedVerdict.scores,
    judgeReasoning: normalizedVerdict.judgeReasoning
  };

  const outputHash = sha256Hex(stableStringify(deterministicVerdict));

  const verdict = {
    verdictVersion: '1.0.0',
    deterministicVerdict,
    metadata: {
      runId,
      generatedAt: finishedAt,
      startedAt,
      model: response.model || model,
      seed,
      responseId: response.id,
      chainId: response.chain_id,
      promptHash,
      inputHash,
      outputHash,
      candidateCount: normalizedInput.candidates.length,
      rubricCount: normalizedInput.rubric.length,
      usage: response.usage || null
    }
  };

  const signatureMessage = `Eigen Verifiable Debate Verdict\nrun_id:${runId}\noutput_sha256:${outputHash}`;
  const signature = await wallet.signMessage(signatureMessage);
  const recoveredAddress = verifyMessage(signatureMessage, signature);

  const verdictSig = {
    signedAt: nowIso(),
    signerAddress: wallet.address,
    recoveredAddress,
    message: signatureMessage,
    signature
  };

  const pathRel = (p) => path.relative(root, p);
  const verdictPath = path.join(runDir, 'verdict.json');
  const verdictSigPath = path.join(runDir, 'verdict.sig.json');
  const judgeResponsePath = path.join(runDir, 'judge_response.json');
  writeJson(verdictPath, verdict);
  writeJson(verdictSigPath, verdictSig);
  writeJson(judgeResponsePath, response);

  const latestEventHashBeforeRun = getLatestGovernanceHash();
  const governanceEvent = appendEvent({
    type: 'debate_verdict_emitted',
    runId,
    inputSha256: inputHash,
    outputSha256: outputHash,
    winnerId: deterministicVerdict.winnerId,
    model: verdict.metadata.model,
    seed,
    verdictPath: pathRel(verdictPath)
  });

  const bundlePath = path.join(runDir, 'verifiability_bundle.json');
  const bundle = {
    bundleVersion: '1.0.0',
    runId,
    generatedAt: nowIso(),
    input: {
      path: pathRel(path.join(runDir, 'debate_input.json')),
      hashSha256: inputHash,
      promptHashSha256: promptHash
    },
    output: {
      verdictPath: pathRel(verdictPath),
      verdictSignaturePath: pathRel(verdictSigPath),
      hashSha256: outputHash
    },
    inference: {
      model: verdict.metadata.model,
      seed,
      responseId: response.id,
      chainId: response.chain_id,
      usage: response.usage || null,
      eigenSignature: response.signature || null,
      finishReason: response?.choices?.[0]?.finish_reason || null
    },
    signatures: {
      localVerdictSigner: verdictSig.signerAddress,
      localVerdictSignature: verdictSig.signature,
      eigenResponseSignature: response.signature || null
    },
    grantEvidence: {
      walletAddress: wallet.address,
      before: grantBefore,
      after: grantAfter,
      tokenDelta: Number(grantBefore?.tokenCount || 0) - Number(grantAfter?.tokenCount || 0),
      usageTotalTokens: Number(response?.usage?.total_tokens || 0)
    },
    governance: {
      sovereignPolicyHash: sha256Hex(stableStringify(sovereignPolicy)),
      debatePolicyHash: sha256Hex(stableStringify(debatePolicy)),
      latestEventHashBeforeRun,
      eventHash: governanceEvent.eventHash,
      prevHash: governanceEvent.prevHash
    },
    replayCommand: `node src/debate_replay.js --bundle ${pathRel(bundlePath)}`,
    rawArtifacts: {
      judgePromptPath: pathRel(path.join(runDir, 'judge_prompt.txt')),
      judgeResponsePath: pathRel(judgeResponsePath),
      modelEnvelopePath: pathRel(path.join(runDir, 'model_verdict_envelope.json'))
    }
  };

  writeJson(path.join(runDir, 'model_verdict_envelope.json'), {
    extractedAt: nowIso(),
    modelOutputContent: content,
    rawEnvelope,
    verdictJsonText: jsonText,
    parsedVerdict: parsed
  });

  writeJson(bundlePath, bundle);
  fs.writeFileSync(path.join(runDir, 'replay.sh'), `#!/usr/bin/env bash\nset -euo pipefail\ncd "${root}"\n${bundle.replayCommand}\n`);
  fs.chmodSync(path.join(runDir, 'replay.sh'), 0o755);

  console.log(JSON.stringify({
    ok: true,
    runId,
    winnerId: deterministicVerdict.winnerId,
    outputHash,
    bundlePath: pathRel(bundlePath),
    verdictPath: pathRel(verdictPath)
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }, null, 2));
  process.exit(1);
});
