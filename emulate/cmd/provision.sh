#!/usr/bin/env bash
# cmd/provision.sh - write retro-pi onto a Raspberry Pi OS boot partition.
#
# From a Mac with the Pi's USB disk mounted, this drops a first-boot installer
# onto bootfs. The next time the board (or the QEMU VM) boots, it unpacks the
# framework, installs RetroArch + cores + ES-DE, and autostarts the frontend.

cmd_provision() {
  local bootfs="" user_name="" password="" pubkey="" enable_ssh=1 autostart=1
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --user)     user_name="${2:-}"; shift ;;
      --password) password="${2:-}"; shift ;;
      --pubkey)   pubkey="${2:-}"; shift ;;
      --no-ssh)   enable_ssh=0 ;;
      --no-autostart) autostart=0 ;;
      -h|--help)
        cat >&2 <<'__H__'
retropi provision - write retro-pi onto a Raspberry Pi OS boot partition

  provision [bootfs]         default: /Volumes/bootfs, then /boot/firmware
  --user <name>              account to create (default: this machine's user)
  --password <pass>          login password (default: generated)
  --pubkey <file>            SSH authorized_keys to install
  --no-ssh                   do not enable sshd
  --no-autostart             do not autostart the frontend after install

Copies a portable archive onto the FAT boot partition and arms a first-boot
hook. Plug the disk into a Pi (or boot the QEMU VM). On first boot, with
network, the Pi installs RetroArch, cores and ES-DE into /opt/retro-pi.

Does not copy ROMs or BIOS images.
__H__
        return 0 ;;
      --*) die "provision: unknown option $1" ;;
      *)
        [[ -z "$bootfs" ]] || die "provision: unexpected argument $1"
        bootfs="$1" ;;
    esac
    shift
  done

  if [[ -z "$bootfs" ]]; then
    local d
    for d in /Volumes/bootfs /boot/firmware /boot; do
      if _provision_is_bootfs "$d"; then bootfs="$d"; break; fi
    done
  fi
  [[ -n "$bootfs" ]] || \
    die "no Raspberry Pi boot partition found; pass the path (e.g. /Volumes/bootfs)"
  _provision_is_bootfs "$bootfs" || \
    die "not a Raspberry Pi boot partition: $bootfs (need cmdline.txt and config.txt)"

  [[ -n "$user_name" ]] || user_name="$(id -un)"
  [[ -n "$user_name" ]] || die "provision: could not determine --user"

  if [[ -z "$pubkey" ]]; then
    local c
    for c in "$HOME/.ssh/id_ed25519.pub" "$HOME/.ssh/id_rsa.pub" "$HOME/.ssh/id_ecdsa.pub"; do
      [[ -f "$c" ]] && { pubkey="$c"; break; }
    done
  fi
  [[ -z "$pubkey" || -f "$pubkey" ]] || die "provision: pubkey not found: $pubkey"

  if [[ -z "$password" ]]; then
    password="$(python3 -c 'import secrets,string; a=string.ascii_letters+string.digits; print("".join(secrets.choice(a) for _ in range(12)))')"
  fi
  need openssl "required to hash the login password"
  local hash
  hash="$(openssl passwd -6 "$password")" || die "provision: openssl passwd failed"

  info "provisioning Raspberry Pi bootfs"
  step "bootfs:  $bootfs"
  step "user:    $user_name"
  step "ssh:     $([[ "$enable_ssh" == "1" ]] && printf 'yes' || printf 'no')"
  [[ -n "$pubkey" ]] && step "pubkey:  $pubkey"

  if [[ "$RETROPI_DRY_RUN" == "1" ]]; then
    step "dry run: would write retropi.tar.gz, firstrun hook, userconf, ssh"
    return 0
  fi

  local stage archive
  stage="$(mktemp -d "${TMPDIR:-/tmp}/retropi-provision.XXXXXX")"
  # shellcheck source=./package.sh
  . "$RETROPI_ROOT/cmd/package.sh"
  cmd_package --name retropi --out "$stage"
  archive="$stage/retropi.tar.gz"
  [[ -f "$archive" ]] || die "provision: package failed"

  run cp "$archive" "$bootfs/retropi.tar.gz"
  run cp "$RETROPI_ROOT/platforms/raspberrypi/firstrun.sh" "$bootfs/retropi-firstrun.sh"

  printf '%s:%s\n' "$user_name" "$hash" > "$bootfs/userconf.txt"
  if [[ "$enable_ssh" == "1" ]]; then
    : > "$bootfs/ssh"
  else
    rm -f "$bootfs/ssh"
  fi
  if [[ -n "$pubkey" ]]; then
    run cp "$pubkey" "$bootfs/retropi_authorized_keys"
  fi
  if [[ "$autostart" != "1" ]]; then
    : > "$bootfs/retropi-no-autostart"
  else
    rm -f "$bootfs/retropi-no-autostart"
  fi
  printf 'login: %s\npassword: %s\nssh: %s@<pi>\n' \
    "$user_name" "$password" "$user_name" > "$bootfs/retropi-credentials.txt"

  _provision_arm_firstrun "$bootfs"
  rm -rf "$stage"

  ok "provisioned $bootfs"
  log ""
  log "User:     $user_name"
  log "Password: $password  (also in $bootfs/retropi-credentials.txt)"
  log "Install:  /opt/retro-pi on first boot with network"
  log "Then:     plug the disk into the Pi, or: ~/rpi-vm/start.sh"
  return 0
}

_provision_is_bootfs() {
  [[ -d "$1" && -f "$1/cmdline.txt" && -f "$1/config.txt" ]]
}

_provision_arm_firstrun() {
  local bootfs="$1"
  local cmdf="$bootfs/cmdline.txt"
  local bak="$bootfs/cmdline.txt.retropi.bak"
  [[ -f "$bak" ]] || cp "$cmdf" "$bak"
  local line
  line="$(tr -d '\n\r' < "$bak")"
  case "$line" in
    *systemd.run=*) line="$(printf '%s' "$line" | sed \
      -e 's| systemd.run=[^ ]*||g' \
      -e 's| systemd.run_success_action=[^ ]*||g' \
      -e 's| systemd.unit=kernel-command-line.target||g')" ;;
  esac
  printf '%s systemd.run=/boot/firmware/retropi-firstrun.sh systemd.run_success_action=reboot systemd.unit=kernel-command-line.target\n' \
    "$line" > "$cmdf"
  ok "armed first-boot hook in cmdline.txt"
}
