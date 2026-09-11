#!/usr/bin/env bash
# tests/lib/assert.sh - assertions for the retro-pi test suite.

ASSERT_FAILURES=""

_fail_assert() {
  ASSERT_FAILURES="$ASSERT_FAILURES  $1"$'\n'
  return 1
}

assert_eq() {
  local expected="$1" actual="$2" msg="${3:-}"
  if [[ "$expected" == "$actual" ]]; then return 0; fi
  _fail_assert "${msg:-assert_eq}: expected [$expected] got [$actual]"
}

assert_ne() {
  local a="$1" b="$2" msg="${3:-}"
  [[ "$a" != "$b" ]] && return 0
  _fail_assert "${msg:-assert_ne}: both were [$a]"
}

assert_contains() {
  local haystack="$1" needle="$2" msg="${3:-}"
  case "$haystack" in
    *"$needle"*) return 0 ;;
  esac
  _fail_assert "${msg:-assert_contains}: [$needle] not found in [${haystack:0:200}]"
}

assert_not_contains() {
  local haystack="$1" needle="$2" msg="${3:-}"
  case "$haystack" in
    *"$needle"*) _fail_assert "${msg:-assert_not_contains}: [$needle] unexpectedly present" ;;
    *) return 0 ;;
  esac
}

assert_file() {
  [[ -f "$1" ]] && return 0
  _fail_assert "${2:-assert_file}: no such file: $1"
}

assert_dir() {
  [[ -d "$1" ]] && return 0
  _fail_assert "${2:-assert_dir}: no such directory: $1"
}

# assert_ok <command...>
assert_ok() {
  if "$@" >/dev/null 2>&1; then return 0; fi
  _fail_assert "assert_ok: command failed: $*"
}

# assert_fails <command...>
assert_fails() {
  if "$@" >/dev/null 2>&1; then
    _fail_assert "assert_fails: command unexpectedly succeeded: $*"
    return 1
  fi
  return 0
}
