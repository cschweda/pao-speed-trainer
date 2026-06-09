#!/usr/bin/env bash
# Fresh-start the Astro dev server: free the port, wipe caches, run `npm run dev`.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-4321}" # astro dev default; no override in astro.config.mjs

# 1) Kill whatever is LISTENING on the port (stale dev server from a previous
#    session). -sTCP:LISTEN keeps browsers/clients with open connections safe.
pids="$(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$pids" ]]; then
  echo "→ killing process(es) listening on :$PORT: $pids"
  kill $pids 2>/dev/null || true
  sleep 1
  pids="$(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "→ still alive, sending SIGKILL: $pids"
    kill -9 $pids 2>/dev/null || true
  fi
fi

# 2) Wipe generated output and caches so every start is fresh
echo "→ clearing caches (.astro, node_modules/.astro, node_modules/.vite, dist)"
rm -rf .astro node_modules/.astro node_modules/.vite dist

# 3) Start the dev server (exec so Ctrl+C reaches it directly)
echo "→ starting dev server on :$PORT"
exec npm run dev
