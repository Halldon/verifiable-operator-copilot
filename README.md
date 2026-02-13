# Verifiable Operator Copilot

Standalone verifiable-agent + sovereign-lite demo.

## What this is

This project demonstrates two layers:

1. **Verifiable execution**
   - deterministic run over snapshot input
   - SHA-256 hashes for code/input/output
   - signed run manifest
   - independent signature verification

2. **Sovereign-lite governance**
   - policy-defined approvers + threshold
   - timelocked upgrade proposals
   - append-only governance event log with hash chaining
   - autonomous cycle runner that appends signed provenance

---

## Verifiable run

```bash
cd /Users/j/.openclaw/workspace/verifiable-operator-copilot
npm install
./run_all.sh
```

Outputs:
- `artifacts/agent_output.json`
- `artifacts/run_manifest.json`
- `artifacts/run_manifest.sig.json`

---

## Sovereign-lite governance flow

### 1) Create a proposal
```bash
npm run gov:propose -- --title "Upgrade scoring weights" --target src/run_agent.js --reason "Tune ranking" --timelock-seconds 60
```

### 2) Collect approvals (policy allowlist)
```bash
npm run gov:approve -- --proposal <proposalId> --approver james
npm run gov:approve -- --proposal <proposalId> --approver ops-peer
```

### 3) Enact after timelock expires
```bash
npm run gov:enact -- --proposal <proposalId>
```

### 4) Run autonomous sovereign cycle
```bash
npm run run:cycle
```

Governance/provenance files:
- `policies/sovereign_policy.json`
- `governance/proposals/*.json`
- `governance/approvals/*.json`
- `governance/events.jsonl` (hash-chained append-only log)

This is **sovereign-lite** (owner-minimized process controls), not fully ownerless sovereignty.
