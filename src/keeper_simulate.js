#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { canonicalize, sha256Hex } = require('./hash_utils');
const { appendEvent } = require('./governance_common');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const get = (k, d='') => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);

const policyPath = path.resolve(root, get('--policy', 'policies/keeper_policy.json'));
const requestPath = path.resolve(root, get('--request'));
if (!get('--request')) {
  throw new Error('Usage: --request <json> [--apply] [--policy policies/keeper_policy.json]');
}

const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));

const registryPath = path.resolve(root, policy.eligibility.registryPath);
const statePath = path.resolve(root, policy.antiReplay.statePath);

const registry = fs.existsSync(registryPath)
  ? JSON.parse(fs.readFileSync(registryPath, 'utf8'))
  : { keepers: {} };

const state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
  : { consumedRequestIds: [], nonces: {} };

function fail(reason, extra = {}) {
  return {
    ok: false,
    reason,
    ...extra
  };
}

function checkEligibility() {
  const keeperAddress = String(request.keeper || '').toLowerCase();
  const keeperInfo = registry.keepers?.[keeperAddress];
  if (!keeperInfo) return fail('keeper_not_registered_in_registry');

  if (policy.eligibility.disallowSlashed && keeperInfo.slashed) {
    return fail('keeper_slashed');
  }

  const minStake = BigInt(String(policy.eligibility.minStake || '0'));
  const observedStake = BigInt(String(keeperInfo.stake || '0'));
  if (observedStake < minStake) {
    return fail('insufficient_stake', { observedStake: observedStake.toString(), minStake: minStake.toString() });
  }

  return { ok: true, keeperInfo };
}

function checkReplayAndNonce(requestId) {
  if (state.consumedRequestIds.includes(requestId)) {
    return fail('request_already_consumed', { requestId });
  }

  const keeper = String(request.keeper || '').toLowerCase();
  const expectedNext = Number(state.nonces[keeper] || 0) + 1;
  const observed = Number(request.nonce);
  if (!Number.isInteger(observed)) return fail('nonce_missing_or_invalid');

  if (policy.antiReplay.enforceStrictNonceIncrement && observed !== expectedNext) {
    return fail('nonce_out_of_sequence', { expectedNext, observed });
  }

  const expiresAtMs = new Date(request.expiresAt || 0).getTime();
  if (!Number.isFinite(expiresAtMs)) return fail('invalid_expiresAt');
  if (Date.now() > expiresAtMs) return fail('request_expired');

  return { ok: true, expectedNext };
}

function checkActionBounds() {
  const action = request.action;
  const bounds = policy.boundedActions[action];
  if (!bounds) return fail('action_not_allowed', { action });

  const params = request.params || {};
  if (action === 'anchor_provenance') {
    const digest = String(params.digest || '').replace(/^0x/, '');
    if (!/^[0-9a-fA-F]{64}$/.test(digest)) return fail('anchor_digest_invalid');
    const chainId = Number(params.chainId);
    if (Array.isArray(bounds.allowedChains) && !bounds.allowedChains.includes(chainId)) {
      return fail('anchor_chain_not_allowed', { chainId, allowedChains: bounds.allowedChains });
    }
    const bytes = Buffer.from(digest, 'hex').length;
    if (bytes > Number(bounds.maxCalldataBytes || 0)) {
      return fail('anchor_calldata_too_large', { bytes, maxCalldataBytes: bounds.maxCalldataBytes });
    }
  }

  if (action === 'treasury_execute') {
    const to = String(params.to || '').toLowerCase();
    const valueWei = BigInt(String(params.valueWei || '0'));
    const allowedRecipients = (bounds.allowlistedRecipients || []).map((x) => String(x).toLowerCase());
    if (!allowedRecipients.includes(to)) {
      return fail('recipient_not_allowlisted', { to });
    }
    const maxNativeWei = BigInt(String(bounds.maxNativeWei || '0'));
    if (valueWei > maxNativeWei) {
      return fail('value_exceeds_bound', { valueWei: valueWei.toString(), maxNativeWei: maxNativeWei.toString() });
    }
  }

  return { ok: true, bounds };
}

const requestId = sha256Hex(canonicalize({
  keeper: request.keeper,
  nonce: request.nonce,
  action: request.action,
  params: request.params,
  expiresAt: request.expiresAt
}));

const eligibility = checkEligibility();
if (!eligibility.ok) {
  console.log(JSON.stringify({ ok:false, requestId, stage:'eligibility', ...eligibility }, null, 2));
  process.exit(1);
}

const replay = checkReplayAndNonce(requestId);
if (!replay.ok) {
  console.log(JSON.stringify({ ok:false, requestId, stage:'antiReplay', ...replay }, null, 2));
  process.exit(1);
}

const bounds = checkActionBounds();
if (!bounds.ok) {
  console.log(JSON.stringify({ ok:false, requestId, stage:'boundedActions', ...bounds }, null, 2));
  process.exit(1);
}

const decision = {
  ok: true,
  requestId,
  keeper: request.keeper,
  nonce: request.nonce,
  action: request.action,
  dryRun: !has('--apply'),
  checks: {
    eligibility: true,
    antiReplay: true,
    boundedActions: true
  }
};

if (has('--apply')) {
  state.consumedRequestIds.push(requestId);
  state.nonces[String(request.keeper).toLowerCase()] = Number(request.nonce);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

  appendEvent({
    type: 'keeper_request_applied',
    requestId,
    keeper: request.keeper,
    nonce: request.nonce,
    action: request.action
  });
}

console.log(JSON.stringify(decision, null, 2));
