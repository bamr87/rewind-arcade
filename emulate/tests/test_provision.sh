#!/usr/bin/env bash
# retropi provision writes a first-boot installer onto a Pi boot partition.

setup_sandbox() {
  RP="$REPO_ROOT/bin/retropi"
  BOOT="$(mktemp -d "${TMPDIR:-/tmp}/retropi-bootfs.XXXXXX")"
  printf 'console=serial0,115200 root=/dev/mmcblk0p2 rootwait\n' > "$BOOT/cmdline.txt"
  printf '# config\narm_64bit=1\n' > "$BOOT/config.txt"
  : > "$BOOT/start.elf"
}

teardown_sandbox() {
  [[ -n "${BOOT:-}" ]] && rm -rf "$BOOT"
}

test_provision_help_names_the_command() {
  assert_contains "$("$RP" provision --help 2>&1)" "retropi provision"
}

test_provision_rejects_a_non_boot_directory() {
  assert_fails "$RP" provision "$BOOT/.."
}

test_provision_dry_run_does_not_write() {
  assert_ok "$RP" --dry-run provision --user retropi --password secret "$BOOT"
  assert_fails test -f "$BOOT/retropi.tar.gz"
  assert_fails test -f "$BOOT/retropi-firstrun.sh"
  assert_contains "$(cat "$BOOT/cmdline.txt")" "root=/dev/mmcblk0p2"
  assert_not_contains "$(cat "$BOOT/cmdline.txt")" "systemd.run"
}

test_provision_writes_hook_archive_and_userconf() {
  assert_ok "$RP" provision --user retropi --password secret --no-ssh "$BOOT"
  assert_file "$BOOT/retropi.tar.gz"
  assert_file "$BOOT/retropi-firstrun.sh"
  assert_file "$BOOT/userconf.txt"
  assert_file "$BOOT/cmdline.txt.retropi.bak"
  assert_fails test -f "$BOOT/ssh"
  local userconf cmdline
  userconf="$(tr -d '\r' < "$BOOT/userconf.txt")"
  assert_contains "$userconf" "retropi:\$6\$"
  cmdline="$(tr -d '\r' < "$BOOT/cmdline.txt")"
  assert_contains "$cmdline" "systemd.run=/boot/firmware/retropi-firstrun.sh"
  assert_contains "$cmdline" "root=/dev/mmcblk0p2"
  assert_contains "$(tar -tzf "$BOOT/retropi.tar.gz")" "platforms/raspberrypi/firstboot.sh"
}

test_provision_is_idempotent_on_cmdline() {
  assert_ok "$RP" provision --user retropi --password secret "$BOOT"
  assert_ok "$RP" provision --user retropi --password secret "$BOOT"
  local n
  n="$(grep -o 'systemd.run=' "$BOOT/cmdline.txt" | wc -l | tr -d ' ')"
  assert_eq "1" "$n"
}
