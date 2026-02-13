# Sovereignty roadmap (phased)

## Phase 0 — Completed in this sprint (scaffolding + controls)

### Delivered
- Governance policy schema supports `authorityMode=contract` and contract authority config.
- Governance scripts support contract mode checks and block local approvals in contract mode.
- Treasury policy supports `contract-controlled` mode + `strictMode`.
- Treasury transfer script blocks unilateral local execution in strict mode.
- Standardized execution receipt + verification scripts.
- Keeper safety model (eligibility/nonces/bounds) via local simulator.
- Provenance anchoring script with dry-run + broadcast + verify support.

### Acceptance criteria
- [x] Contract mode proposal artifacts can be created.
- [x] Contract mode enact path requires onchain state check (or explicit dry-run skip behavior).
- [x] Strict treasury mode prevents unilateral execution.
- [x] Receipt bundles verify correctly.
- [x] Keeper simulation enforces replay and bounds.
- [x] Anchor dry-run path produces valid calldata payload.

---

## Phase 1 — Contract deployment + config cutover

### Tasks
1. Deploy OpenZeppelin Governor + Timelock (or equivalent) to target chain.
2. Set `policies/sovereign_policy.json`:
   - `governance.authorityMode = contract`
   - `governance.contractAuthority.{governorAddress,timelockAddress,rpcEnv}`
3. Run test proposal lifecycle onchain and ensure `gov:enact` passes only in accepted governor states.

### Acceptance criteria
- [ ] Onchain governor proposal reaches expected state (`Executed` by default).
- [ ] Local `gov:approve` cannot be used in production runbooks.
- [ ] Governance event logs include contract proposal IDs and state evidence.

---

## Phase 2 — Treasury custody migration

### Tasks
1. Deploy treasury control contract / Safe module with policy-constrained execution.
2. Transfer treasury ownership/custody to contract.
3. Set `policies/treasury_policy.json`:
   - `sovereignty.mode = contract-controlled`
   - `sovereignty.strictMode = true`
   - `contractControl.authorityContract` and method names

### Acceptance criteria
- [ ] Direct local key execution path disabled in production.
- [ ] All treasury actions require contract approval digest.
- [ ] Execution requests map 1:1 to onchain actions and are auditable.

---

## Phase 3 — Keeper decentralization

### Tasks
1. Deploy keeper eligibility + nonce/replay guard contract (or integrate existing network).
2. Replace single-process cron flows with multi-keeper execution.
3. Add slashing/bond policy or explicit penalty mechanism for malicious keepers.

### Acceptance criteria
- [ ] At least N independent keepers can execute eligible actions.
- [ ] Duplicate nonce or replay attempts are rejected onchain.
- [ ] Keeper actions remain bounded to policy-defined limits.

---

## Phase 4 — Attestation + anchoring operations

### Tasks
1. Make receipt generation mandatory in autonomous cycles.
2. Integrate optional attestation backend (e.g., EAS or AVS-specific attestations).
3. Run scheduled provenance anchoring to chain and monitor failures.

### Acceptance criteria
- [ ] 100% of production runs emit verifiable receipts.
- [ ] Anchor txs are generated and verified at defined cadence.
- [ ] Alerting in place for failed anchors or missing receipts.

---

## Residual blockers (known)

- Missing deployed governor/timelock/safe addresses.
- Missing production signer and RPC envs for onchain write paths.
- Keeper decentralization infra not yet deployed.
