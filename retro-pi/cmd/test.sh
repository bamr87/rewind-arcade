#!/usr/bin/env bash
# cmd/test.sh - run the test suite.

cmd_test() {
  local runner="$RETROPI_ROOT/tests/run.sh"
  [[ -x "$runner" ]] || die "test runner not found or not executable: $runner"
  exec "$runner" "$@"
}
