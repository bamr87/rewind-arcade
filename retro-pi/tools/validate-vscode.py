#!/usr/bin/env python3
"""Validate the .vscode configuration, and optionally run every launch config.

VSCode fails these files quietly: a bad program path, a picker option naming a
test file that was renamed, or a `pathBash` that does not exist on this machine
all surface as a confusing error at F5 time rather than as a broken build.

    tools/validate-vscode.py           # static checks only
    tools/validate-vscode.py --run     # also execute each launch configuration
    tools/validate-vscode.py --json    # machine readable summary
    tools/validate-vscode.py --portable  # skip probes of this machine's tools

`--portable` drops the one check that depends on the machine rather than the
config: whether the local `bash` is new enough (>= 4) for the Bash Debug
extension. CI and tests/run.sh use it because the suite deliberately also runs
on stock macOS bash 3.2, where that probe can never pass.

Exits non-zero when anything is wrong.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VSCODE = os.path.join(ROOT, ".vscode")

KNOWN_TYPES = {"debugpy", "python", "bashdb", "node", "lldb", "cppdbg"}
KNOWN_VARS = {
    "workspaceFolder", "workspaceFolderBasename", "file", "fileBasename",
    "fileDirname", "cwd", "env", "config", "userHome", "pathSeparator",
}


def strip_jsonc(text: str) -> str:
    """Remove // and /* */ comments, respecting string literals."""
    out, i, n = [], 0, len(text)
    in_str = in_line = in_block = False
    while i < n:
        c = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        if in_line:
            if c == "\n":
                in_line = False
                out.append(c)
        elif in_block:
            if c == "*" and nxt == "/":
                in_block = False
                i += 1
        elif in_str:
            out.append(c)
            if c == "\\":
                out.append(nxt)
                i += 1
            elif c == '"':
                in_str = False
        else:
            if c == "/" and nxt == "/":
                in_line = True
                i += 1
            elif c == "/" and nxt == "*":
                in_block = True
                i += 1
            else:
                if c == '"':
                    in_str = True
                out.append(c)
        i += 1
    return "".join(out)


class Report:
    def __init__(self) -> None:
        self.problems: list[str] = []
        self.warnings: list[str] = []
        self.notes: list[str] = []

    def problem(self, msg: str) -> None:
        self.problems.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def note(self, msg: str) -> None:
        self.notes.append(msg)


def load(name: str, rep: Report):
    path = os.path.join(VSCODE, name)
    if not os.path.exists(path):
        rep.problem(f"{name}: missing")
        return None
    try:
        return json.loads(strip_jsonc(open(path, encoding="utf-8").read()))
    except json.JSONDecodeError as exc:
        rep.problem(f"{name}: invalid JSONC at line {exc.lineno}: {exc.msg}")
        return None


def resolve(value: str, inputs: dict) -> str:
    value = value.replace("${workspaceFolder}", ROOT)
    for key in re.findall(r"\$\{input:(\w+)\}", value):
        value = value.replace("${input:%s}" % key, str(inputs.get(key, {}).get("default", "")))
    return value


def check_launch(doc, rep: Report, probe_machine: bool = True) -> None:
    configs = doc.get("configurations", [])
    inputs = {i["id"]: i for i in doc.get("inputs", [])}
    if not configs:
        rep.problem("launch.json: no configurations")
        return
    rep.note(f"launch.json: {len(configs)} configurations, {len(inputs)} inputs")

    seen = set()
    for c in configs:
        name = c.get("name", "<unnamed>")
        if name in seen:
            rep.problem(f"[{name}] duplicate configuration name")
        seen.add(name)

        for field in ("name", "type", "request", "program"):
            if field not in c:
                rep.problem(f"[{name}] missing required field '{field}'")
        if c.get("request") not in ("launch", "attach"):
            rep.problem(f"[{name}] invalid request '{c.get('request')}'")
        if c.get("type") not in KNOWN_TYPES:
            rep.warn(f"[{name}] unrecognized debug type '{c.get('type')}'")

        for kind, val in re.findall(r"\$\{(\w+)(?::([^}]+))?\}", json.dumps(c)):
            if kind == "input":
                if val not in inputs:
                    rep.problem(f"[{name}] references undefined input '{val}'")
            elif kind not in KNOWN_VARS:
                rep.warn(f"[{name}] unknown variable ${{{kind}}}")

        prog = resolve(c.get("program", ""), inputs)
        if not os.path.exists(prog):
            rep.problem(f"[{name}] program not found: {prog}")
        elif c.get("type") == "bashdb" and not os.access(prog, os.X_OK):
            rep.problem(f"[{name}] program not executable: {prog}")

        if c.get("type") == "bashdb" and probe_machine:
            _check_bash(name, c.get("pathBash", "bash"), rep)

    for iid, spec in inputs.items():
        if spec.get("type") == "pickString":
            options = spec.get("options", [])
            if not options:
                rep.problem(f"input '{iid}': no options")
            default = spec.get("default")
            if default is not None and default not in options:
                rep.problem(f"input '{iid}': default '{default}' not among options")


def _check_bash(name: str, path: str, rep: Report) -> None:
    resolved = shutil.which(path) if not path.startswith("/") else (path if os.path.exists(path) else None)
    if not resolved:
        rep.problem(f"[{name}] pathBash '{path}' does not resolve on this machine")
        return
    try:
        major = subprocess.run(
            [resolved, "-c", "echo ${BASH_VERSINFO[0]}"],
            capture_output=True, text=True, timeout=15,
        ).stdout.strip()
    except Exception as exc:  # noqa: BLE001
        rep.warn(f"[{name}] could not probe {resolved}: {exc}")
        return
    if major.isdigit() and int(major) < 4:
        rep.problem(
            f"[{name}] pathBash resolves to bash {major}.x ({resolved}); "
            "the Bash Debug extension needs >= 4 (macOS: brew install bash)"
        )


def check_inputs_match_repo(doc, rep: Report) -> None:
    """Picker options must name things that actually exist."""
    inputs = {i["id"]: i for i in doc.get("inputs", [])}
    for sysid in inputs.get("systemId", {}).get("options", []):
        if not os.path.exists(os.path.join(ROOT, "config", "systems", f"{sysid}.yaml")):
            rep.problem(f"input systemId: '{sysid}' has no config/systems/{sysid}.yaml")
    for test in inputs.get("testFile", {}).get("options", []):
        if not os.path.exists(os.path.join(ROOT, "tests", f"test_{test}.sh")):
            rep.problem(f"input testFile: '{test}' has no tests/test_{test}.sh")


def check_tasks(doc, rep: Report) -> None:
    tasks = doc.get("tasks", [])
    if not tasks:
        rep.problem("tasks.json: no tasks")
        return
    rep.note(f"tasks.json: {len(tasks)} tasks")
    labels = {t.get("label") for t in tasks}
    inputs = {i["id"]: i for i in doc.get("inputs", [])}
    for t in tasks:
        label = t.get("label", "<unlabeled>")
        if "command" not in t:
            rep.problem(f"task '{label}': no command")
        dep = t.get("dependsOn")
        for d in ([dep] if isinstance(dep, str) else dep or []):
            if d not in labels:
                rep.problem(f"task '{label}': dependsOn unknown task '{d}'")
        for kind, val in re.findall(r"\$\{(\w+)(?::([^}]+))?\}", json.dumps(t)):
            if kind == "input" and val not in inputs:
                rep.problem(f"task '{label}': references undefined input '{val}'")
    defaults = [t for t in tasks if isinstance(t.get("group"), dict) and t["group"].get("isDefault")]
    if not defaults:
        rep.warn("tasks.json: no default build task")


def run_configs(doc, rep: Report, verbose: bool) -> list:
    inputs = {i["id"]: i for i in doc.get("inputs", [])}
    results = []
    for c in doc.get("configurations", []):
        name = c["name"]
        prog = resolve(c["program"], inputs)
        args = [resolve(a, inputs) for a in c.get("args", [])]
        env = dict(os.environ)
        env.update(c.get("env", {}))
        env["NO_COLOR"] = "1"

        if c["type"] in ("debugpy", "python"):
            argv = [sys.executable, prog] + args
        else:
            argv = [c.get("pathBash", "bash"), prog] + args

        gui = "run-rom" in prog and "--print" not in args
        try:
            if gui:
                proc = subprocess.Popen(
                    argv, cwd=ROOT, env=env, stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT, start_new_session=True)
                try:
                    out = proc.communicate(timeout=12)[0].decode("utf-8", "replace")
                    rc = proc.returncode
                except subprocess.TimeoutExpired:
                    os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                    out = proc.communicate()[0].decode("utf-8", "replace")
                    out += "\n[launched, then stopped by the validator]"
                    rc = 0
            else:
                proc = subprocess.run(argv, cwd=ROOT, env=env, capture_output=True,
                                      text=True, timeout=300)
                rc, out = proc.returncode, (proc.stdout or "") + (proc.stderr or "")
        except Exception as exc:  # noqa: BLE001
            rc, out = 255, f"EXEC FAILED: {exc}"

        started = not any(m in out for m in
                          ("EXEC FAILED", "command not found", "No such file or directory"))
        # A command may exit non-zero for real reasons (doctor finding problems).
        # What matters here is whether the CONFIGURATION is runnable. An
        # argument-parsing error means the config passes something invalid.
        argerr = bool(re.search(r"unknown (option|command|subcommand)", out))
        if argerr:
            rep.problem(f"[{name}] arguments rejected: "
                        f"{re.findall(r'.*unknown (?:option|command|subcommand).*', out)[0].strip()}")
        if not started:
            rep.problem(f"[{name}] failed to start: {out.strip().splitlines()[-1][:80]}")

        last = out.strip().splitlines()[-1][:60] if out.strip() else "<no output>"
        results.append({"name": name, "rc": rc, "ok": started and not argerr, "last": last})
        if verbose:
            print(f"  {'OK' if started and not argerr else 'XX'} {name:<48} rc={rc:<4} {last}")
    return results


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", action="store_true", help="execute every launch configuration")
    ap.add_argument("--json", action="store_true", help="emit a machine readable summary")
    ap.add_argument("--portable", action="store_true",
                    help="skip checks that depend on this machine's tools (local bash version)")
    args = ap.parse_args()

    rep = Report()
    launch = load("launch.json", rep)
    tasks = load("tasks.json", rep)
    load("settings.json", rep)
    load("extensions.json", rep)

    if launch:
        check_launch(launch, rep, probe_machine=not args.portable)
        check_inputs_match_repo(launch, rep)
    if tasks:
        check_tasks(tasks, rep)

    results = []
    if args.run and launch and not rep.problems:
        if not args.json:
            print("\nrunning configurations:")
        results = run_configs(launch, rep, verbose=not args.json)

    if args.json:
        print(json.dumps({"problems": rep.problems, "warnings": rep.warnings,
                          "results": results}, indent=2))
        return 1 if rep.problems else 0

    print()
    for n in rep.notes:
        print(f"  . {n}")
    for w in rep.warnings:
        print(f"  ! {w}")
    for p in rep.problems:
        print(f"  x {p}")
    print()
    if rep.problems:
        print(f"FAILED: {len(rep.problems)} problem(s), {len(rep.warnings)} warning(s)")
        return 1
    ran = f", {len(results)} configurations ran" if results else ""
    print(f"OK: .vscode configuration is valid{ran}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
