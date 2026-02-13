# Verifiable Operator Copilot → Verifiable Debate Arena

Challenge-ready implementation of **EigenCloud Verifiable AI Judge** with sovereign hardening scaffolding.

This repo currently operates in **sovereign-lite** mode by default, with contract-governed and strict treasury modes available as opt-in scaffolding.

## What this does today

- accepts a debate prompt + 2+ candidate arguments
- runs deterministic judging via **EigenAI grant-auth flow**
- emits signed verdict + verifiability bundle
- integrates with autonomous watchdog loop
- supports governance proposals with local threshold (default) or onchain contract mode (scaffold)
- supports treasury transfer flow with strict-mode block against unilateral local execution
- supports execution receipts and provenance anchoring dry-runs

---

## Quickstart

```bash
cd /Users/j/.openclaw/workspace/verifiable-operator-copilot
npm install

# first-time only: ensure treasury wallet + EigenAI grant are available
npm run eigenai:status

# one-command challenge validation
npm run debate:demo
```

Outputs:
- `artifacts/debate/challenge-audit/latest/challenge_audit_report.json`
- `docs/challenge_readiness_audit.md`
- full run artifacts under `artifacts/debate/challenge-audit/latest/runs/*`

---

## Governance modes

### Local threshold mode (default)

```bash
npm run gov:propose -- --title "Upgrade scoring weights" --target src/run_agent.js --reason "Tune ranking" --timelock-seconds 60
npm run gov:approve -- --proposal <proposalId> --approver james
npm run gov:approve -- --proposal <proposalId> --approver ops-peer
npm run gov:enact -- --proposal <proposalId>
```

### Contract-governed scaffold mode

```bash
npm run gov:propose -- --authority-mode contract --title "Enable governed upgrade" --target src/run_agent.js --contract-proposal-id 123 --skip-contract-check
npm run gov:enact -- --proposal <proposalId> --contract-proposal-id 123 --dry-run
```

In contract mode, local `gov:approve` is intentionally blocked.

---

## Treasury sovereignty controls

- `policies/treasury_policy.json` includes:
  - `sovereignty.mode`: `local-agent-key` or `contract-controlled`
  - `sovereignty.strictMode`: when true, unilateral local execution is blocked

Example strict-mode behavior:

```bash
npm run treasury:transfer -- --recipient <allowlisted> --rpc <rpc> --native 0.001
# => fails fast in strict mode and emits execution request artifact
```

---

## Verifiable execution receipts

```bash
npm run receipt:generate -- --input artifacts/agent_output.json --code src/run_agent.js --output artifacts/run_manifest.json --operation sovereign_cycle --out artifacts/execution-receipt.json --private-key $RECEIPT_SIGNER_PRIVATE_KEY
npm run receipt:verify -- --receipt artifacts/execution-receipt.json
```

Receipt fields include input/code/output hashes, signer signature, and optional attestation metadata.

---

## Permissionless keeper simulation (safe local model)

```bash
npm run keeper:simulate -- --request demo/keeper_request.sample.json
```

Policy controls:
- stake-threshold eligibility
- nonce + replay protection
- bounded action constraints

---

## Provenance anchoring path

```bash
npm run anchor:provenance -- --from-file governance/events.jsonl --dry-run
npm run anchor:provenance -- --verify --tx-hash <hash> --digest <digest>
```

Broadcast mode is supported when RPC + key are configured.

---

## Sovereignty hardening docs

- `docs/eigen_reference_examples.md`
- `docs/sovereignty_gap.md`
- `docs/sovereignty_roadmap.md`
- `docs/sovereignty_audit_report.md`

---

## Testing

```bash
npm test
npm run sovereignty:test
```

`sovereignty:test` is dry-run heavy and is designed to work without live contract deploys.
