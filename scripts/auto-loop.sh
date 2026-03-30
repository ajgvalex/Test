#!/bin/bash
# =============================================================================
# Polymarket Auto-Trading Loop
# Runs the scanner every 60 minutes in crypto mode
# Usage: nohup bash scripts/auto-loop.sh &
# Stop:  kill $(cat .auto-loop.pid)
# =============================================================================

cd "$(dirname "$0")/.." || exit 1
echo $$ > .auto-loop.pid

INTERVAL=3600  # 60 minutes in seconds
LOG="auto-trade.log"

echo "============================================" | tee -a "$LOG"
echo "Auto-trading loop started at $(date)"        | tee -a "$LOG"
echo "PID: $$"                                      | tee -a "$LOG"
echo "Interval: ${INTERVAL}s (60 min)"             | tee -a "$LOG"
echo "============================================" | tee -a "$LOG"

while true; do
  echo ""                                           | tee -a "$LOG"
  echo ">>> Run at $(date) <<<"                     | tee -a "$LOG"
  echo ""                                           | tee -a "$LOG"

  npx tsx scripts/scan-markets.ts \
    --crypto \
    --auto \
    --aggressive \
    -c medium \
    -r 15 \
    --max-trades 3 \
    --max-per-trade 5 \
    2>&1 | tee -a "$LOG"

  echo ""                                           | tee -a "$LOG"
  echo ">>> Done. Next run in 60 minutes. <<<"      | tee -a "$LOG"
  echo ""                                           | tee -a "$LOG"

  sleep $INTERVAL
done
