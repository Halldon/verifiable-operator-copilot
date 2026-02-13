# Sovereignty gap: current vs target

## Honest current state (after this sprint)

Current mode is **sovereign-lite with hardening scaffolds**.

What is true now:
- Policy-driven governance exists with threshold + timelock (local signatures).
- Contract-governed mode is scaffolded and enforced in scripts (local approve path disabled in contract mode).
- Treasury strict mode can block unilateral local execution and emit execution requests.
- Execution receipt standard + verification script implemented.
- Keeper safety model implemented for local simulation (eligibility, nonces, bounded actions).
- Provenance anchoring script supports dry-run, broadcast, and verification paths.

What is **not** true yet:
- No deployed governor/timelock addresses are configured in policy.
- No deployed contract-controlled treasury executor is wired live.
- Keeper model is local simulation, not a production decentralized keeper network.
- No production attestation provider integration is enforced.

## Target sovereign-compliant state

A realistic target state for honest “sovereign-compliant” claims should include all of:
1. **Onchain governance live**: deployed Governor + Timelock/Safe module, with policy switched to `authorityMode=contract`.
2. **Treasury contract custody live**: treasury owned/controlled by contract(s), strict mode enabled, local unilateral path disabled in prod.
3. **Receipt + attestation pipeline live**: receipts always emitted, signatures validated, optional attestations anchored or posted to attestation network.
4. **Permissionless keeper execution live**: decentralized keepers execute bounded actions; anti-replay is enforced onchain.
5. **Onchain provenance anchoring in operation**: periodic anchor txs verified against local provenance digests.

## Gap summary table

| Capability | Current | Target | Gap |
|---|---|---|---|
| Governance authority | Local threshold default + contract mode scaffold | Contract-governed upgrade authority live | Deploy/configure governor + timelock + switch policy |
| Treasury custody | Local key default, strict-mode block available | Contract-controlled treasury only in production | Deploy treasury controller/safe module; set strict true |
| Execution receipts | Implemented scripts | Mandatory per run + external attestations | Enforce in run pipeline + attestation backend |
| Keepers | Local simulation model | Permissionless decentralized executor network | Deploy keeper contracts/network integration |
| Onchain anchoring | Script path implemented | Scheduled production anchoring with monitoring | Configure signer + cadence + alerting |

## Claim boundary statement (for README/docs/user-facing)

> This project is **not yet ownerless sovereign infrastructure**. It is in a hardened sovereign-lite phase with contract-governed and strict treasury pathways implemented, pending live contract deployment and decentralized executor rollout.
