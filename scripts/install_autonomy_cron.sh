#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CRON_LINE="*/30 * * * * cd $ROOT && /usr/bin/env npm run auto:watchdog >> $ROOT/governance/autonomy-cron.log 2>&1"
( crontab -l 2>/dev/null | grep -v "verifiable-operator-copilot.*auto:watchdog"; echo "$CRON_LINE" ) | crontab -
echo "Installed cron watchdog:" 
echo "$CRON_LINE"
