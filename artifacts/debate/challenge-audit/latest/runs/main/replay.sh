#!/usr/bin/env bash
set -euo pipefail
cd "/Users/j/.openclaw/workspace/verifiable-operator-copilot"
node src/debate_replay.js --bundle artifacts/debate/challenge-audit/latest/runs/main/verifiability_bundle.json
