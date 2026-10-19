#!/usr/bin/env bash
# tests/run.sh - the retro-pi test suite.
#
# No external dependencies: every test file defines functions named test_*,
# and each runs in its own subshell against a throwaway sandbox so the suite
# never touches your real ROMs, cores or frontend config.
#
#   ./tests/run.sh              run everything
#   ./tests/run.sh yamlite      run files matching a pattern
#   ./tests/run.sh -v           show each test name

set -o errexit
set -o nounset
set -o pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TESTS_DIR/.." && pwd)"
export REPO_ROOT

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  T_RED=$'\033[31m'; T_GREEN=$'\033[32m'
  T_DIM=$'\033[2m'; T_BOLD=$'\033[1m'; T_RESET=$'\033[0m'
else
  T_RED=''; T_GREEN=''; T_DIM=''; T_BOLD=''; T_RESET=''
fi

VERBOSE=0
PATTERN=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -v|--verbose) VERBOSE=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) PATTERN="$1" ;;
  esac
  shift
done

TOTAL=0; PASSED=0; FAILED=0; FAILED_NAMES=""

# Each test file gets a pristine sandbox: a copy of the repo's config plus
# redirected core/frontend directories.
make_sandbox() {
  local sb
  sb="$(mktemp -d "${TMPDIR:-/tmp}/retropi-test.XXXXXX")"
  mkdir -p "$sb/config" "$sb/cores" "$sb/es" "$sb/roms" "$sb/bios" "$sb/saves"
  cp -R "$REPO_ROOT/config/systems" "$sb/config/systems"
  cp "$REPO_ROOT/config/retropi.yaml" "$sb/config/retropi.yaml"
  printf '%s' "$sb"
}

run_file() {
  local file="$1" name fn
  name="$(basename "$file" .sh)"
  local fns
  fns="$(grep -o '^test_[A-Za-z0-9_]*' "$file" | sort -u || true)"
  [[ -n "$fns" ]] || return 0

  printf '%s%s%s\n' "$T_BOLD" "$name" "$T_RESET"
  for fn in $fns; do
    TOTAL=$((TOTAL+1))
    local output status
    # Subshell isolation: a test that dies cannot take the suite with it.
    output="$(
      set +o errexit
      # shellcheck source=/dev/null
      . "$TESTS_DIR/lib/assert.sh"
      # shellcheck source=/dev/null
      . "$file"
      ASSERT_FAILURES=""
      setup_sandbox 2>/dev/null || true
      "$fn" >/dev/null 2>&1
      rc=$?
      teardown_sandbox 2>/dev/null || true
      if [[ -n "$ASSERT_FAILURES" ]]; then
        printf '%s' "$ASSERT_FAILURES"
        exit 1
      fi
      exit "$rc"
    )" && status=0 || status=1

    if [[ "$status" -eq 0 ]]; then
      PASSED=$((PASSED+1))
      if [[ "$VERBOSE" == "1" ]]; then
        printf '  %s+%s %s\n' "$T_GREEN" "$T_RESET" "$fn"
      fi
    else
      FAILED=$((FAILED+1))
      FAILED_NAMES="$FAILED_NAMES  $name/$fn"$'\n'
      printf '  %sx%s %s\n' "$T_RED" "$T_RESET" "$fn"
      if [[ -n "$output" ]]; then
        printf '%s%s%s\n' "$T_DIM" "$output" "$T_RESET"
      fi
    fi
  done
  # A trailing false test must not abort the suite under `set -e`.
  return 0
}

printf '%sretro-pi test suite%s  (bash %s on %s)\n\n' \
  "$T_BOLD" "$T_RESET" "${BASH_VERSION%%(*}" "$(uname -s)"

for f in "$TESTS_DIR"/test_*.sh; do
  [[ -e "$f" ]] || continue
  if [[ -n "$PATTERN" ]]; then
    case "$(basename "$f")" in *"$PATTERN"*) ;; *) continue ;; esac
  fi
  run_file "$f"
done

printf '\n'
if [[ "$FAILED" -eq 0 ]]; then
  printf '%s%d passed%s, %d total\n' "$T_GREEN" "$PASSED" "$T_RESET" "$TOTAL"
  exit 0
fi
printf '%s%d failed%s, %s%d passed%s, %d total\n' \
  "$T_RED" "$FAILED" "$T_RESET" "$T_GREEN" "$PASSED" "$T_RESET" "$TOTAL"
printf '\nfailed tests:\n%s' "$FAILED_NAMES"
exit 1
