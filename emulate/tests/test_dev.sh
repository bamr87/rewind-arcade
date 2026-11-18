#!/usr/bin/env bash
# The dev harness: the RetroArch command client (lib/racmd.py), the headless
# libretro host (lib/retrohost.py), and how `retropi dev` hooks into launches.
# Nothing here needs a running RetroArch; the one test that emulates needs an
# installed NES core and passes trivially without one (CI has none).

setup_sandbox() {
  DEV="$(mktemp -d "${TMPDIR:-/tmp}/retropi-dev.XXXXXX")"
  PY() { python3 -c "import sys; sys.path.insert(0, '$REPO_ROOT/lib'); $1"; }
}
teardown_sandbox() { [[ -n "${DEV:-}" ]] && rm -rf "$DEV"; }

test_racmd_parses_replies_and_buttons() {
  assert_eq "[15, 171]" "$(PY 'import racmd; print(list(racmd._parse_bytes("READ_CORE_RAM 0 0F AB", 2)))')"
  assert_eq "None" "$(PY 'import racmd; print(racmd._parse_bytes("READ_CORE_MEMORY 7e0000 -1 no memory map defined", 2))')"
  assert_eq "[7, 0]" "$(PY 'import racmd; print(racmd.parse_buttons("right+b"))')"
  assert_contains "$(PY 'import racmd; print(racmd.hexdump(0x75a, bytes([9])))')" "00075A  09"
}

test_racmd_reports_a_missing_retroarch_cleanly() {
  # A port nothing listens on: a clear error and exit 1, not a traceback.
  local out
  out="$(python3 "$REPO_ROOT/lib/racmd.py" --port 9 status 2>&1)" && return 1
  assert_contains "$out" "no reply from RetroArch"
}

test_network_retropad_datagram_is_twenty_bytes() {
  # RetroArch drops a remote_message of any other size.
  assert_eq "20" "$(PY 'import struct; print(struct.calcsize("<iiiiH2x"))')"
}

test_retrohost_buttons_and_press_plan() {
  assert_eq "$((1 << 7 | 1))" "$(PY 'from retrohost import Buttons; print(Buttons.parse("right+b"))')"
  assert_eq "[(60, 62, 8), (100, 100, 256)]" \
    "$(PY 'import retrohost; print(retrohost._parse_press("start@60:62,a@100"))')"
  assert_fails PY 'from retrohost import Buttons; Buttons.parse("turbo")'
}

test_retrohost_converts_every_pixel_format() {
  # One pure-red pixel in each libretro pixel format, as RGB and as a PNG.
  local out
  out="$(PY '
from retrohost import Frame, PIXEL_XRGB8888, PIXEL_RGB565, PIXEL_0RGB1555
for fmt, raw in ((PIXEL_XRGB8888, bytes([0, 0, 255, 0])),
                 (PIXEL_RGB565, (0xF800).to_bytes(2, "little")),
                 (PIXEL_0RGB1555, (0x7C00).to_bytes(2, "little"))):
    f = Frame(1, 1, len(raw), fmt, raw)
    print(list(f.rgb()), f.png()[:8] == b"\x89PNG\r\n\x1a\n")
')"
  assert_eq "[255, 0, 0] True
[255, 0, 0] True
[255, 0, 0] True" "$out"
}

test_extra_overlay_rides_along_with_the_launch_command() {
  # `dev run` hands its dev profile to RetroArch through this hook; the
  # frontend's own launches never set it.
  local out
  out="$(RETROPI_EXTRA_OVERLAY=/tmp/dev-profile.cfg "$REPO_ROOT/bin/retropi" systems show nes 2>&1)"
  assert_contains "$out" "retroarch-retropi.cfg|/tmp/dev-profile.cfg"
  assert_not_contains "$("$REPO_ROOT/bin/retropi" systems show nes 2>&1)" "dev-profile"
}

test_headless_host_drives_a_real_core_deterministically() {
  local core=""
  for c in fceumm nestopia; do
    for d in "${RETROPI_CORE_DIR:-}" "${XDG_CONFIG_HOME:-$HOME/.config}/retroarch/cores"; do
      [[ -n "$d" && -f "$d/${c}_libretro.so" ]] && { core="$d/${c}_libretro.so"; break 2; }
    done
  done
  [[ -n "$core" ]] || return 0      # no NES core on this machine (CI): nothing to drive
  python3 "$REPO_ROOT/tests/fixtures/make_test_rom.py" "$DEV/test.nes" >/dev/null
  local out
  out="$(PY "
from retrohost import Core, Buttons
with Core('$core', '$DEV/test.nes') as e:
    e.run(30)
    s = e.save_state()
    e.run(60, Buttons.START); a = (bytes(e.ram), e.frame.data)
    e.load_state(s)
    e.run(60, Buttons.START); b = (bytes(e.ram), e.frame.data)
    print(a == b, len(e.ram), e.frame.width, e.frame.height)
    e.save_png('$DEV/frame.png')
")"
  assert_eq "True 2048 256 240" "$out"
  assert_eq "89504e47" "$(head -c 4 "$DEV/frame.png" | od -An -tx1 | tr -d ' \n')"
}

test_core_python_imports_only_the_standard_library() {
  # The ML plan's invariant: nothing under lib/ needs a pip package.
  local out
  out="$(python3 - "$REPO_ROOT/lib" <<'__PY__'
import ast, os, sys
lib = sys.argv[1]
local = {f[:-3] for f in os.listdir(lib) if f.endswith(".py")}
bad = []
for f in sorted(os.listdir(lib)):
    if not f.endswith(".py"):
        continue
    for node in ast.walk(ast.parse(open(os.path.join(lib, f)).read())):
        names = []
        if isinstance(node, ast.Import):
            names = [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            names = [node.module]
        for n in names:
            top = n.split(".")[0]
            if top not in sys.stdlib_module_names and top not in local and top != "yaml":
                bad.append(f"{f}:{n}")
print(" ".join(bad))
__PY__
)"
  # yaml is the optional PyYAML fast path yamlite.py already guards.
  assert_eq "" "$out" "non-stdlib imports in lib/: $out"
}

test_ml_pack_keeps_its_stack_out_of_git() {
  local ig
  ig="$(cat "$REPO_ROOT/packages/ml/.gitignore")"
  assert_contains "$ig" ".venv/"
  assert_contains "$ig" "runs/"
}

test_ml_without_its_venv_says_how_to_install_it() {
  # A copy of the tree with the pack but no virtualenv, as on a fresh machine.
  mkdir -p "$DEV/tree/packages"
  cp -R "$REPO_ROOT/bin" "$REPO_ROOT/lib" "$REPO_ROOT/cmd" "$REPO_ROOT/config" "$DEV/tree/"
  rm -f "$DEV/tree/config/local.yaml"
  mkdir -p "$DEV/tree/packages/ml"
  cp "$REPO_ROOT/packages/ml/"*.py "$REPO_ROOT/packages/ml/"*.sh "$DEV/tree/packages/ml/"
  local out
  out="$(RETROPI_ON_HOST=1 "$DEV/tree/bin/retropi" ml train 2>&1)" && return 1
  assert_contains "$out" "ml stack not installed"
  assert_contains "$(RETROPI_ON_HOST=1 "$DEV/tree/bin/retropi" ml --help 2>&1)" "retropi ml"
}

test_ml_report_renders_a_run_from_its_own_records() {
  # report.py is standard library: a synthetic run renders without the venv.
  local name="test-report-$$" run
  run="$REPO_ROOT/packages/ml/runs/$name"
  mkdir -p "$run"
  printf '%s\n' \
    '{"step": 0, "frames": 0, "wall_s": 1, "video": "videos/step-000000000.mp4", "deterministic": {"episodes": 2, "flag_rate": 0, "max_x_mean": 40, "max_x_median": 40, "max_x_best": 40, "max_x_worst": 40, "return_mean": 0, "frames_mean": 100, "ends": {"flag": 0, "death": 2, "timeout": 0}}, "stochastic": {"episodes": 2, "flag_rate": 0, "max_x_mean": 700, "max_x_median": 700, "max_x_best": 900, "max_x_worst": 500, "return_mean": 1, "frames_mean": 400, "ends": {"flag": 0, "death": 2, "timeout": 0}}}' \
    '{"step": 500000, "frames": 2000000, "wall_s": 600, "video": "videos/step-000500000.mp4", "deterministic": {"episodes": 2, "flag_rate": 0.5, "max_x_mean": 2100, "max_x_median": 2100, "max_x_best": 3100, "max_x_worst": 1100, "return_mean": 5, "frames_mean": 900, "ends": {"flag": 1, "death": 1, "timeout": 0}}, "stochastic": {"episodes": 2, "flag_rate": 0, "max_x_mean": 1500, "max_x_median": 1500, "max_x_best": 1600, "max_x_worst": 1400, "return_mean": 3, "frames_mean": 800, "ends": {"flag": 0, "death": 2, "timeout": 0}}}' \
    > "$run/progress.jsonl"
  printf '{"steps": 1000000, "envs": 4}\n' > "$run/settings.json"
  local out
  out="$(python3 "$REPO_ROOT/packages/ml/report.py" "$name")"
  local html
  html="$(cat "$run/report/index.html" 2>/dev/null)"
  rm -rf "$run"
  assert_contains "$out" "report/index.html"
  assert_contains "$html" "<title>Mario 1-1 Agent</title>"
  assert_contains "$html" "videos/step-000500000.mp4"
  assert_contains "$html" "2,100"
  assert_contains "$html" "50%"
}

test_ml_video_writer_makes_a_real_mp4() {
  local py="$REPO_ROOT/packages/ml/.venv/bin/python"
  [[ -x "$py" ]] && command -v ffmpeg >/dev/null 2>&1 || return 0   # no venv or ffmpeg: CI
  # A venv built on the host does not work inside a Flatpak sandbox (retropi
  # ml hops out for that reason); nothing to check from here.
  "$py" -c 'import numpy' >/dev/null 2>&1 || return 0
  "$py" -c "
import sys; sys.path.insert(0, '$REPO_ROOT/packages/ml')
import numpy as np
from video import write_mp4, caption_bar
assert caption_bar('STEP 1.0M X 1234', 256).shape == (11, 256, 3)
write_mp4([np.full((240, 256, 3), i, np.uint8) for i in range(30)], '$DEV/t.mp4', caption='TEST')
" || return 1
  assert_contains "$(head -c 12 "$DEV/t.mp4" | od -An -c | tr -d ' \n')" "ftyp"
}
