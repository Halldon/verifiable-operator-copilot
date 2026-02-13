# Submission Copy — Verifiable Debate Arena

## One-line description
Verifiable Debate Arena is an autonomous EigenAI-powered judge that deterministically scores competing arguments, emits signed verdicts, and ships replayable cryptographic proof bundles for end-to-end trust.

## Extended description
Verifiable Debate Arena implements the EigenAI **Verifiable AI Judge** pattern as a production-style, challenge-ready pipeline.

A user submits a debate prompt and 2+ candidate arguments. The system runs a seeded EigenAI grant-auth inference to score each argument against a weighted rubric, computes a deterministic winner, signs the verdict with the agent wallet, and outputs a verifiability bundle containing input hash, output hash, model, seed, signatures, and replay command.

The pipeline is integrated into an autonomous sovereign-lite runtime with policy limits, watchdog operation, and append-only governance provenance chaining. Challenge validation includes a clean-state run, two deterministic replays with identical output hashes, a negative seed test that changes output, and grant-token usage evidence.

## Architecture summary
1. **Input + policy gate**
   - JSON debate input validated against `policies/debate_policy.json`
   - limits enforced (debaters, prompt size, argument size, model allowlist)
2. **Deterministic EigenAI inference**
   - grant-auth flow (`message` + wallet signature)
   - fixed model + seed + params
   - model emits structured verdict envelope
3. **Verdict normalization + signing**
   - rubric scores normalized
   - deterministic winner computed from weighted rubric
   - verdict signed with wallet key (`verdict.sig.json`)
4. **Verifiability bundle**
   - input/prompt/output hashes
   - Eigen signature + local signature
   - replay command + governance policy hashes + event hash linkage
5. **Autonomous sovereign-lite loop**
   - queue processing via `src/debate_autonomous_cycle.js`
   - watchdog integration via `src/autonomous_once.js`
   - provenance append to `governance/events.jsonl`

## Paste-ready short social post
Built **Verifiable Debate Arena** on EigenAI: deterministic seeded judging of multi-argument debates, signed verdict artifacts, replayable hash proofs, and autonomous sovereign-lite operation with governance provenance. Replays match bit-for-bit; changed seed diverges as expected. 🔐🤖
