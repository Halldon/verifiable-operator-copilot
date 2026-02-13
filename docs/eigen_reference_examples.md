# Eigen ecosystem reference examples (sovereignty hardening benchmark)

This matrix benchmarks patterns used in Eigen ecosystem projects (plus adjacent infra where Eigen repos are silent on production ops details).

## Comparison matrix

| Domain | Reference project / standard | Pattern observed | Why it matters for sovereignty | Mapping in this repo |
|---|---|---|---|---|
| Onchain governance / upgrade controls | EigenLayer contracts deployments + OZ proxy stack ([Layr-Labs/eigenlayer-contracts README](https://github.com/Layr-Labs/eigenlayer-contracts), [OZ TransparentUpgradeableProxy](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/proxy/transparent/TransparentUpgradeableProxy.sol)) | Upgradeable core contracts managed via explicit proxy admin patterns | Upgrade authority is externalized from app code into contract-admin governance surfaces | Added `governance.authorityMode` with `contractAuthority` policy schema and contract-state checks in `propose/enact` flow |
| Emergency controls / threshold separation | `PauserRegistry` in EigenLayer contracts ([PauserRegistry.sol](https://github.com/Layr-Labs/eigenlayer-contracts/blob/main/src/contracts/permissions/PauserRegistry.sol), [Pausable.sol](https://github.com/Layr-Labs/eigenlayer-contracts/blob/main/src/contracts/permissions/Pausable.sol)) | Distinct pauser/unpauser roles; comments explicitly expect stronger security for unpauser (e.g., higher-threshold multisig) | Role separation reduces unilateral control and supports emergency response without full admin key use | Policy now separates default local mode from contract authority mode and documents transition to higher-threshold contract governance |
| Timelock governance | OpenZeppelin Governor + TimelockController ([Governance docs](https://docs.openzeppelin.com/contracts/5.x/governance), [TimelockController.sol](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/governance/TimelockController.sol)) | Proposer/executor/canceller roles + minimum delay before execution | Delayed execution gives community/operator exit window and prevents instant privileged upgrades | `enact_upgrade.js` contract mode now checks onchain governor proposal state (default `Executed`) before local enactment marker |
| Treasury custody pattern | Safe smart account ([Safe.sol](https://github.com/safe-global/safe-smart-account/blob/main/contracts/Safe.sol), [Safe docs](https://docs.safe.global/home/what-is-safe)) | Explicit threshold + nonce replay protection for transaction execution | Treasury control anchored in contract signatures/nonces vs single local key | Added `treasury_policy.sovereignty` contract-control mode + strict-mode unilateral execution block + request bundle emission |
| Verifiable execution / attestations | Incredible Squaring AVS ([repo README](https://github.com/Layr-Labs/incredible-squaring-avs)) | Operators sign responses, aggregator uses quorum threshold and aggregated signatures before onchain submission | Verifiability should include who signed what under which task hash | Added standardized execution receipt bundle with input/code/output hashes + signer + optional attestation metadata; added verifier script |
| AVS operator eligibility / slashing backdrop | Eigen middleware + ELIP-002 ([eigenlayer-middleware README](https://github.com/Layr-Labs/eigenlayer-middleware), [ELIP-002](https://github.com/eigenfoundation/ELIPs/blob/main/ELIPs/ELIP-002.md)) | Operator sets + slashable commitments tied to explicit conditions and stake segmentation | Permissionless execution still needs eligibility + bounded fault domain | Added keeper policy with stake-threshold eligibility, anti-replay nonces, bounded action envelopes |
| Decentralized keepers / executors (adjacent) | Chainlink Automation ([docs](https://docs.chain.link/chainlink-automation)) | Distributed offchain executor network performs upkeep triggers | Reduces single-cron/operator liveness and censorship risk | Local keeper simulator designed as pre-deploy step before migrating to decentralized keeper network |
| Registry freshness / keeper-like maintenance | Incredible Squaring “StakeUpdates Cronjob” note ([README section](https://github.com/Layr-Labs/incredible-squaring-avs#stakeupdates-cronjob)) | Registry stake updates currently require periodic external process | Shows real AVS ops still need robust keeper/maintenance design | Added explicit keeper simulation model + deployment checklist in roadmap docs |

## Practical takeaways applied here

1. **No unilateral governance path in contract mode**: local signature approvals are blocked when `authorityMode=contract`.
2. **Treasury strict mode fail-closed**: strict mode blocks local signing and emits a contract-execution request artifact.
3. **Receipts become first-class artifacts**: every execution can produce an auditable, signed, hash-linked receipt.
4. **Keeper safety envelope**: eligibility + nonce + bounds are enforced before any simulated keeper action is accepted.
5. **Anchoring path provided**: provenance digest can be prepared as calldata (dry-run) and verified after broadcast.

## Notes on claim boundary

These upgrades are **scaffolding toward sovereign-compliant operation**, not proof of full ownerless sovereignty. Full claim requires live deployed governance/treasury contracts, decentralized keeper execution, and operational decentralization evidence.
