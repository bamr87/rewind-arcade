#!/usr/bin/env bash
# Documentation drifts silently. These assert the parts that can be checked:
# every command is documented, every internal link resolves, every doc is
# reachable from the index.

setup_sandbox() { DOCS="$REPO_ROOT/docs"; }
teardown_sandbox() { :; }

test_every_command_is_in_the_reference() {
  local f name missing=""
  for f in "$REPO_ROOT"/cmd/*.sh; do
    name="$(basename "$f" .sh)"
    grep -q "\`$name\`\|### \`$name\`\|^### $name" "$DOCS/commands.md" \
      || missing="$missing $name"
  done
  assert_eq "" "$missing" "commands missing from docs/commands.md:$missing"
}

test_every_command_help_matches_its_name() {
  # The dispatcher finds commands by filename; help text must agree.
  local f name out missing=""
  for f in "$REPO_ROOT"/cmd/*.sh; do
    name="$(basename "$f" .sh)"
    [[ "$name" == "test" ]] && continue   # delegates to tests/run.sh
    out="$("$REPO_ROOT/bin/retropi" "$name" --help 2>&1 | head -1)" || true
    case "$out" in
      "retropi $name"*) ;;
      *) missing="$missing $name" ;;
    esac
  done
  assert_eq "" "$missing" "help text does not start with 'retropi <name>':$missing"
}

test_internal_doc_links_resolve() {
  local broken
  broken="$(python3 - "$REPO_ROOT" <<'__PY__'
import os, re, sys, glob
root = sys.argv[1]
bad = []
targets = (glob.glob(os.path.join(root, "*.md"))
           + glob.glob(os.path.join(root, "docs", "*.md"))
           + glob.glob(os.path.join(root, "*", "README.md")))
for path in targets:
    for m in re.finditer(r"\[([^\]]+)\]\(([^)]+)\)", open(path, encoding="utf-8").read()):
        target = m.group(2)
        if target.startswith(("http", "#", "mailto")):
            continue
        resolved = os.path.normpath(
            os.path.join(os.path.dirname(path), target.split("#")[0]))
        if not os.path.exists(resolved):
            bad.append(f"{os.path.relpath(path, root)} -> {target}")
print("\n".join(bad))
__PY__
)" || true
  assert_eq "" "$broken" "broken internal links"
}

test_every_doc_is_listed_in_the_index() {
  local f name missing=""
  for f in "$DOCS"/*.md; do
    name="$(basename "$f")"
    [[ "$name" == "README.md" ]] && continue
    grep -q "$name" "$DOCS/README.md" || missing="$missing $name"
  done
  assert_eq "" "$missing" "docs missing from docs/README.md:$missing"
}

test_readme_points_at_the_docs_index() {
  assert_contains "$(cat "$REPO_ROOT/README.md")" "docs/README.md"
}

test_contributing_exists_and_states_the_hard_constraints() {
  local c="$REPO_ROOT/CONTRIBUTING.md"
  assert_file "$c"
  local body
  body="$(cat "$c")"
  assert_contains "$body" "bash 3.2"
  assert_contains "$body" "make test-linux"
}

test_every_lib_module_is_described_in_the_architecture() {
  local f name missing=""
  for f in "$REPO_ROOT"/lib/*.sh "$REPO_ROOT"/lib/*.py; do
    name="$(basename "$f")"
    grep -q "$name" "$DOCS/architecture.md" || missing="$missing $name"
    grep -q "$name" "$REPO_ROOT/AGENTS.md"   || missing="$missing $name(AGENTS.md)"
  done
  assert_eq "" "$missing" "lib modules undocumented:$missing"
}
