#!/usr/bin/env bash
# Fails if a secret-looking value is committed to git or shipped in the browser bundle.
# Usage: npm run check:secrets   (run after `npm run build` to also scan the bundle)
set -euo pipefail
cd "$(dirname "$0")/.."

PATTERN='sb_secret_[A-Za-z0-9_-]{10,}|service_role"?[^a-z]{0,5}eyJ|SUPABASE_SERVICE_ROLE_KEY=.+|GOCSPX-[A-Za-z0-9_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
status=0

tracked_env=$(git ls-files | grep -E '(^|/)\.env' | grep -v '\.env\.example$' || true)
if [[ -n "$tracked_env" ]]; then
  echo "FAIL: .env files are tracked by git:"; echo "$tracked_env"; status=1
fi

if git grep -nIE "$PATTERN" -- ':!scripts/check-secrets.sh' >/dev/null 2>&1; then
  echo "FAIL: secret-like value in tracked files:"
  git grep -nIE "$PATTERN" -- ':!scripts/check-secrets.sh' | cut -c1-120; status=1
fi

if git rev-list --all >/dev/null 2>&1 && [[ -n "$(git rev-list --all)" ]]; then
  if git rev-list --all | xargs -r git grep -IE "$PATTERN" -- ':!scripts/check-secrets.sh' >/dev/null 2>&1; then
    echo "FAIL: secret-like value somewhere in git history"; status=1
  fi
fi

if [[ -d .next/static ]]; then
  if grep -rIlE "$PATTERN|service_role" .next/static >/dev/null 2>&1; then
    echo "FAIL: secret-like value in the browser bundle:"; grep -rIlE "$PATTERN|service_role" .next/static; status=1
  fi
else
  echo "note: no build found; run 'npm run build' first to scan the browser bundle"
fi

[[ $status -eq 0 ]] && echo "PASS: no secrets in git, history or browser bundle"
exit $status
