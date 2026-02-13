# Verifiable Operator Copilot → Verifiable Debate Arena

Challenge-ready standalone implementation of **EigenCloud Verifiable AI Judge**:

- accepts a debate prompt + 2+ candidate arguments
- runs deterministic judging via **EigenAI grant-auth flow**
- emits a **signed verdict artifact**
- emits a **verifiability bundle** (input/output hashes, model, seed, signatures, replay command)
- integrates with the existing sovereign-lite autonomous/watchdog loop

---

## Quickstart

```bash
cd /Users/j/.openclaw/workspace/verifiable-operator-copilot
npm install

# first-time only: ensure treasury wallet + EigenAI grant are available
npm run eigenai:status

# one-command end-to-end challenge validation
npm run debate:demo
```

If grant status is false, request credits at https://determinal.eigenarcade.com/ and retry.

Outputs:
- `artifacts/debate/challenge-audit/latest/challenge_audit_report.json`
- `docs/challenge_readiness_audit.md`
- full run artifacts under `artifacts/debate/challenge-audit/latest/runs/*`

---

## Manual debate run

```bash
npm run debate:run -- --input demo/debate_sample.json --seed 2026 --run-id demo-main
npm run debate:verify -- --bundle artifacts/debate/runs/demo-main/verifiability_bundle.json
npm run debate:replay -- --bundle artifacts/debate/runs/demo-main/verifiability_bundle.json
```

Core artifacts per run:
- `debate_input.json`
- `judge_prompt.txt`
- `judge_response.json`
- `verdict.json`
- `verdict.sig.json`
- `verifiability_bundle.json`
- `replay.sh`

---

## Autonomous operation (watchdog integrated)

- `src/autonomous_once.js` now executes `src/debate_autonomous_cycle.js`
- queue new jobs in `artifacts/debate/inbox/*.json`
- process runs are policy-limited by `policies/debate_policy.json`

Watchdog command:
```bash
npm run auto:watchdog
```

---

## Sovereign-lite alignment

Debate runs append to the existing governance provenance chain (`governance/events.jsonl`) via event type:
- `debate_verdict_emitted`

Each verifiability bundle includes:
- sovereign policy hash
- debate policy hash
- governance event hash / previous hash

---

## Challenge docs

- `docs/challenge_checklist.md`
- `docs/challenge_readiness_audit.md`
- `docs/submission_copy.md`
- user-facing demo page: `demo/index.html`

---

## Existing sovereign-lite governance flow (unchanged)

```bash
npm run gov:propose -- --title "Upgrade scoring weights" --target src/run_agent.js --reason "Tune ranking" --timelock-seconds 60
npm run gov:approve -- --proposal <proposalId> --approver james
npm run gov:approve -- --proposal <proposalId> --approver ops-peer
npm run gov:enact -- --proposal <proposalId>
```

This repository remains sovereign-lite (policy, timelock, multi-approver provenance), now extended with verifiable debate judging.
