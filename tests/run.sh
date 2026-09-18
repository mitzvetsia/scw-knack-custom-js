#!/usr/bin/env bash
# Runs every tests/**/test-*.js under node (jsdom from tests/node_modules).
# Each script prints ok/FAIL lines and exits non-zero on any failure.
cd "$(dirname "$0")" || exit 1
[ -d node_modules/jsdom ] || { echo "jsdom missing — run: cd tests && npm install"; exit 1; }
fail=0
for t in */test-*.js; do
  echo "── $t"
  node "$t" | grep -E '^(FAIL|RESULT)' || true
  node "$t" > /dev/null 2>&1 || fail=1
done
[ $fail -eq 0 ] && echo "ALL PASS" || { echo "SOME FAILED"; exit 1; }
