#!/usr/bin/env node
const fetch = global.fetch;

/**
 * Gasless relay adapter.
 *
 * Env/config contract (intentionally provider-agnostic):
 * - relayUrl: HTTP endpoint for gasless tx relay
 * - apiKey: bearer/API key for relay auth
 *
 * Payload shape sent:
 * {
 *   chainId, from, to,
 *   type: 'native' | 'erc20',
 *   valueWei?, token?, amount?
 * }
 */

async function submitGasless({ relayUrl, apiKey, payload, dryRun = false }) {
  if (!relayUrl || !apiKey) {
    return { ok: false, reason: 'gasless relay not configured' };
  }

  if (dryRun) {
    return { ok: true, mode: 'dry-run', relayUrl, payload };
  }

  const r = await fetch(relayUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  let body;
  try { body = await r.json(); } catch { body = { raw: await r.text() }; }

  if (!r.ok) {
    return { ok: false, reason: 'relay rejected', status: r.status, body };
  }

  return {
    ok: true,
    relayTxId: body.txId || body.id || null,
    txHash: body.txHash || body.hash || null,
    body
  };
}

module.exports = { submitGasless };
