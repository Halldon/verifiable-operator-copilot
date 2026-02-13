#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ethers } = require('ethers');
const { submitGasless } = require('./gasless_executor');
const { canonicalize, sha256Hex } = require('./hash_utils');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const get = (k, d='') => { const i=args.indexOf(k); return i>=0 ? args[i+1] : d; };
const has = (k) => args.includes(k);

const policyPath = path.resolve(root, get('--policy', 'policies/treasury_policy.json'));
const metaPath = path.resolve(root, get('--meta', 'treasury/agent-treasury-meta.json'));
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : null;

const recipient = get('--recipient');
const rpc = get('--rpc');
const nativeAmount = get('--native');
const token = get('--token');
const amount = get('--amount');
const nonce = get('--nonce', String(Date.now()));
const dryRun = has('--dry-run');
const forceOnchain = has('--onchain-only');
const emitRequestPath = get('--emit-request', '');

if (!recipient || (!rpc && !dryRun)) throw new Error('Usage: --recipient <addr> [--rpc <url>] [--native 0.001 | --token <erc20> --amount <units>] [--dry-run] [--onchain-only]');
if (!policy.limits.allowedRecipients.includes(recipient)) throw new Error('Recipient not allowlisted');

const sovereignty = policy.sovereignty || {};
const sovereigntyMode = sovereignty.mode || 'local-agent-key';
const strictMode = Boolean(sovereignty.strictMode);

function buildPayload(fromAddress) {
  if (nativeAmount) {
    return {
      chainId: policy.wallet.chainId,
      from: fromAddress,
      to: recipient,
      nonce,
      type: 'native',
      valueWei: ethers.parseEther(nativeAmount).toString()
    };
  }

  if (token && amount) {
    return {
      chainId: policy.wallet.chainId,
      from: fromAddress,
      to: recipient,
      nonce,
      type: 'erc20',
      token,
      amount
    };
  }

  throw new Error('Specify either --native or --token + --amount');
}

async function checkContractApproval(intentDigest) {
  const cfg = sovereignty.contractControl || {};
  if (!cfg.authorityContract) {
    return {
      checked: false,
      approved: false,
      consumed: false,
      reason: 'contractControl.authorityContract not configured'
    };
  }

  const rpcUrl = cfg.rpcUrl || process.env[cfg.rpcEnv || 'BASE_RPC_URL'] || rpc || '';
  if (!rpcUrl) {
    return {
      checked: false,
      approved: false,
      consumed: false,
      reason: `Missing RPC URL (${cfg.rpcEnv || 'BASE_RPC_URL'})`
    };
  }

  const approvalFn = cfg.approvalFunction || 'isActionApproved';
  const consumedFn = cfg.consumedFunction || 'isActionConsumed';
  const abi = [
    `function ${approvalFn}(bytes32) view returns (bool)`,
    `function ${consumedFn}(bytes32) view returns (bool)`
  ];

  const provider = new ethers.JsonRpcProvider(rpcUrl, cfg.chainId || policy.wallet.chainId);
  const c = new ethers.Contract(cfg.authorityContract, abi, provider);

  let approved = false;
  let consumed = false;
  try { approved = await c[approvalFn](`0x${intentDigest}`); } catch {}
  try { consumed = await c[consumedFn](`0x${intentDigest}`); } catch {}

  return {
    checked: true,
    approved: Boolean(approved),
    consumed: Boolean(consumed),
    authorityContract: cfg.authorityContract,
    approvalFn,
    consumedFn
  };
}

function emitExecutionRequest(bundle) {
  const requestsDir = path.join(root, 'treasury', 'execution-requests');
  fs.mkdirSync(requestsDir, { recursive: true });
  const out = emitRequestPath || path.join(requestsDir, `req-${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify(bundle, null, 2));
  return out;
}

(async()=>{
  const fromAddress = meta?.address || '0x0000000000000000000000000000000000000000';
  const payload = buildPayload(fromAddress);
  const intentDigest = sha256Hex(canonicalize({ payload, policyVersion: policy.version, sovereigntyMode }));
  const approval = await checkContractApproval(intentDigest);

  const requestBundle = {
    schema: 'voc.treasury.execution-request.v1',
    createdAt: new Date().toISOString(),
    sovereigntyMode,
    strictMode,
    payload,
    intentDigest,
    contractApproval: approval,
    policyPath,
    notes: [
      'For contract-controlled treasury, execute via onchain controller/safe module.',
      'Digest must be approved onchain before execution in strict mode.'
    ]
  };

  if (sovereigntyMode === 'contract-controlled' || strictMode) {
    const requestPath = emitExecutionRequest(requestBundle);

    if (strictMode && !dryRun) {
      throw new Error(`Strict treasury mode blocks unilateral local execution. Execution request emitted at ${requestPath}`);
    }

    if (sovereigntyMode === 'contract-controlled' && approval.checked && (!approval.approved || approval.consumed) && !dryRun) {
      throw new Error('Contract authority check failed: digest not approved or already consumed.');
    }

    if (dryRun) {
      return console.log(JSON.stringify({
        ok: true,
        mode: 'dry-run',
        sovereigntyMode,
        strictMode,
        intentDigest,
        contractApproval: approval,
        executionRequestPath: requestPath,
        blockedLocalExecution: strictMode
      }, null, 2));
    }
  }

  if (!meta) throw new Error(`Missing treasury metadata at ${metaPath}`);
  const passphrase = execSync(`security find-generic-password -a ${meta.keychainRef.account} -s ${meta.keychainRef.service} -w`).toString().trim();
  const enc = fs.readFileSync(meta.keystorePath, 'utf8');
  const wallet = await ethers.Wallet.fromEncryptedJson(enc, passphrase);

  const preferGasless = policy.execution?.preferGasless && !forceOnchain;
  if (preferGasless) {
    const relayUrl = policy.execution?.gaslessRelay?.relayUrl || process.env.ETHGAS_RELAY_URL || '';
    const apiKeyEnv = policy.execution?.gaslessRelay?.apiKeyEnv || 'ETHGAS_API_KEY';
    const apiKey = process.env[apiKeyEnv] || '';

    const relay = await submitGasless({ relayUrl, apiKey, payload: { ...payload, from: wallet.address }, dryRun });
    if (relay.ok) {
      return console.log(JSON.stringify({ ok:true, rail:'gasless', intentDigest, ...relay }, null, 2));
    }

    if (!policy.execution?.fallbackOnchain) {
      return console.log(JSON.stringify({ ok:false, rail:'gasless', reason: relay.reason || 'failed', details: relay, intentDigest }, null, 2));
    }
  }

  const provider = new ethers.JsonRpcProvider(rpc, policy.wallet.chainId);
  const signer = wallet.connect(provider);

  if (nativeAmount) {
    const tx = { to: recipient, value: ethers.parseEther(nativeAmount) };
    if (dryRun) return console.log(JSON.stringify({ ok:true, rail:'onchain', mode:'dry-run', type:'native', from: wallet.address, tx: { to: tx.to, valueWei: tx.value.toString() }, intentDigest }, null, 2));
    const sent = await signer.sendTransaction(tx);
    await sent.wait();
    return console.log(JSON.stringify({ ok:true, rail:'onchain', type:'native', hash: sent.hash, intentDigest }, null, 2));
  }

  const abi = ['function transfer(address to,uint256 value) returns (bool)'];
  const c = new ethers.Contract(token, abi, signer);
  if (dryRun) return console.log(JSON.stringify({ ok:true, rail:'onchain', mode:'dry-run', type:'erc20', from: wallet.address, token, recipient, amount, intentDigest }, null, 2));
  const sent = await c.transfer(recipient, amount);
  await sent.wait();
  return console.log(JSON.stringify({ ok:true, rail:'onchain', type:'erc20', hash: sent.hash, token, intentDigest }, null, 2));
})();
