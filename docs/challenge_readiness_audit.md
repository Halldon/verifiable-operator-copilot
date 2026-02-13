# Verifiable Debate Arena — Challenge Readiness Audit

Generated: 2026-02-13T21:59:04.694Z
Workspace: `/Users/j/.openclaw/workspace/verifiable-operator-copilot`

## Test scope
- Clean-state directory reset: `artifacts/debate/challenge-audit/latest`
- Sample input: `demo/debate_sample.json`
- Model: `gpt-oss-120b-f16`
- Deterministic seed baseline: `2026`

## Verification results
| Requirement | Status | Evidence |
|---|---|---|
| Clean-state top-to-bottom run completes | ✅ PASS | Reset artifacts/debate/challenge-audit/latest then executed 4 full runs |
| Deterministic replay check #1 | ✅ PASS | main=ac7b9f0a865ced8a91f39d069c4ccebaa9852347c146ac00ea77f62964501bee replay-1=ac7b9f0a865ced8a91f39d069c4ccebaa9852347c146ac00ea77f62964501bee |
| Deterministic replay check #2 | ✅ PASS | main=ac7b9f0a865ced8a91f39d069c4ccebaa9852347c146ac00ea77f62964501bee replay-2=ac7b9f0a865ced8a91f39d069c4ccebaa9852347c146ac00ea77f62964501bee |
| Negative check (changed seed changes result) | ✅ PASS | main=ac7b9f0a865ced8a91f39d069c4ccebaa9852347c146ac00ea77f62964501bee negative=97b84af0366c05169c5c05bcd714e886cace1bbdf2e48a9243877499a71abebd |
| Grant token check + usage evidence present | ✅ PASS | beforeHasGrant=true aggregateUsageTokens=5044 aggregateTokenDelta=7200 |
| Signed verdict artifact verifies | ✅ PASS | debate_verify.js passed for baseline run |

## Deterministic proof runs
| Label | Run ID | Seed | Winner | Output Hash |
|---|---:|---:|---|---|
| baseline | main | 2026 | hybrid-plan | `ac7b9f0a865ced8a91f39d069c4ccebaa9852347c146ac00ea77f62964501bee` |
| replay-1 | replay-1 | 2026 | hybrid-plan | `ac7b9f0a865ced8a91f39d069c4ccebaa9852347c146ac00ea77f62964501bee` |
| replay-2 | replay-2 | 2026 | hybrid-plan | `ac7b9f0a865ced8a91f39d069c4ccebaa9852347c146ac00ea77f62964501bee` |
| negative-seed | negative-seed | 2027 | hybrid-plan | `97b84af0366c05169c5c05bcd714e886cace1bbdf2e48a9243877499a71abebd` |

## Grant & token evidence
- Grant before first run: hasGrant=**true**, tokenCount=**975926**
- Grant after last run: hasGrant=**true**, tokenCount=**968726**
- Aggregate token delta across runs: **7200**
- Aggregate model-reported tokens used: **5044**

## Residual risks
- API/model availability remains an external dependency.
- Eigen response signature is captured and persisted, but full onchain signer recovery is not re-computed in this script (documented in challenge mapping and verifiability bundle).
- Token accounting depends on upstream grant accounting freshness.
