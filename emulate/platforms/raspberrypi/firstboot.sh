#!/usr/bin/env bash
# After-network first boot: bootstrap the OS, install RetroArch + cores +
# ES-DE, generate config, and autostart the frontend. Safe to re-run; it
# no-ops once /var/lib/retropi/installed exists.

set -o errexit
set -o nounset
set -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG=/var/log/retropi-firstboot.log
install -d "$(dirname "$LOG")"
exec >>"$LOG" 2>&1
echo "retropi firstboot $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

# shellcheck source=../../lib/common.sh
. "$ROOT/lib/common.sh"
# shellcheck source=../../lib/platform.sh
. "$ROOT/lib/platform.sh"
detect_platform

if [[ -f /var/lib/retropi/installed ]]; then
  ok "already installed"
  exit 0
fi

USER_NAME=""
if [[ -f "$ROOT/.retropi-user" ]]; then
  USER_NAME="$(tr -d '\r\n' < "$ROOT/.retropi-user")"
fi
if [[ -z "$USER_NAME" ]]; then
  USER_NAME="$(getent passwd 1000 2>/dev/null | cut -d: -f1 || true)"
fi
[[ -n "$USER_NAME" ]] || USER_NAME="${SUDO_USER:-${USER:-pi}}"
USER_HOME="$(getent passwd "$USER_NAME" | cut -d: -f6)"
[[ -n "$USER_HOME" ]] || USER_HOME="/home/$USER_NAME"

wait_for_network() {
  local n=0
  while [[ "$n" -lt 30 ]]; do
    if ping -c1 -W2 1.1.1.1 >/dev/null 2>&1 || \
       ping -c1 -W2 8.8.8.8 >/dev/null 2>&1; then
      return 0
    fi
    n=$((n+1))
    sleep 2
  done
  return 1
}

info "waiting for network"
if ! wait_for_network; then
  warn "no network this boot - will retry next boot"
  exit 0
fi

export RETROPI_ASSUME_YES=1 HOME="$USER_HOME" USER="$USER_NAME"
cd "$ROOT"

"$ROOT/platforms/raspberrypi/bootstrap.sh" || \
  "$ROOT/platforms/debian/bootstrap.sh"

if have apt-get; then
  fuse_pkg="$(appimage_fuse_package)"
  sudo apt-get install -y --no-install-recommends \
    "$fuse_pkg" fuse3 xinit xserver-xorg x11-xserver-utils xdotool || true
fi

as_user() {
  sudo -u "$USER_NAME" -H -- "$@"
}

as_user "$ROOT/bin/retropi" install --all || \
  as_user "$ROOT/bin/retropi" install

if [[ ! -f /boot/firmware/retropi-no-autostart && ! -f /boot/retropi-no-autostart ]]; then
  autostart="$USER_HOME/.config/autostart"
  install -d -m 755 -o "$USER_NAME" -g "$USER_NAME" "$autostart"
  cat > "$autostart/retropi-frontend.desktop" <<__DESK__
[Desktop Entry]
Type=Application
Name=retro-pi
Comment=Start the retro-pi frontend
Exec=$ROOT/bin/retropi frontend launch
X-GNOME-Autostart-enabled=true
__DESK__
  chown "$USER_NAME:$USER_NAME" "$autostart/retropi-frontend.desktop"
  if command -v raspi-config >/dev/null 2>&1; then
    raspi-config nonint do_boot_behaviour B4 || true
  fi
fi

install -d /var/lib/retropi
date -u '+%Y-%m-%dT%H:%M:%SZ' > /var/lib/retropi/installed
systemctl disable retropi-firstboot.service >/dev/null 2>&1 || true
ok "retro-pi installed for $USER_NAME"
exit 0
