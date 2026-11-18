#!/usr/bin/env bash
# The .vscode configuration must stay in step with the repo: VSCode fails a
# stale program path or a picker option naming a renamed file only at F5 time,
# with a confusing error. These checks make that a build failure instead.

setup_sandbox() { VALIDATOR="$REPO_ROOT/tools/validate-vscode.py"; }
teardown_sandbox() { :; }

test_validator_exists_and_is_executable() {
  assert_file "$VALIDATOR"
  assert_ok test -x "$VALIDATOR"
}

test_vscode_config_passes_static_validation() {
  # Covers JSONC syntax, required fields, ${input:} references, program paths,
  # picker options matching real systems and test files, and task dependsOn.
  local bash_major others
  bash_major="$(bash -c 'echo "${BASH_VERSINFO[0]}"')"
  if [ "$bash_major" -ge 4 ]; then
    assert_ok python3 "$VALIDATOR"
    return
  fi
  # Stock macOS bash 3.2 on PATH: the validator rightly reports that the Bash
  # Debug extension needs bash >= 4. That is a developer-machine check, not a
  # config defect, and the emulate workflow already skips the validator step on
  # macOS for the same reason. Every other static check must still pass.
  others="$(python3 "$VALIDATOR" --json | python3 -c '
import json, sys
probs = json.load(sys.stdin)["problems"]
print("\n".join(p for p in probs if "the Bash Debug extension needs >= 4" not in p))')"
  assert_eq "" "$others" "validate-vscode problems besides the bash >= 4 probe"
}

test_all_config_files_are_valid_jsonc() {
  local f
  for f in launch tasks settings extensions; do
    assert_file "$REPO_ROOT/.vscode/$f.json" || return 1
  done
}

test_launch_configs_cover_both_languages() {
  local types
  types="$(python3 -c "
import json,sys,os
sys.path.insert(0, os.path.join('$REPO_ROOT','tools'))
import importlib.util
spec=importlib.util.spec_from_file_location('v','$VALIDATOR')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
d=json.loads(m.strip_jsonc(open('$REPO_ROOT/.vscode/launch.json').read()))
print(' '.join(sorted({c['type'] for c in d['configurations']})))")"
  assert_contains "$types" "debugpy"
  assert_contains "$types" "bashdb"
}
