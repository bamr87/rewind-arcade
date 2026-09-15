#!/bin/bash
# Early first-boot hook. systemd.run executes this instead of the default
# target, so it MUST restore cmdline.txt on every exit or the board boot-loops.
# Unpacks retro-pi onto the rootfs and arms the after-network firstboot unit.

set +e

BOOT=""
for d in /boot/firmware /boot; do
  if [ -f "$d/cmdline.txt" ] && [ -f "$d/retropi.tar.gz" ]; then
    BOOT="$d"
    break
  fi
done
[ -n "$BOOT" ] || BOOT=/boot/firmware

LOG=/var/log/retropi-firstrun.log
mkdir -p "$(dirname "$LOG")" 2>/dev/null
exec >>"$LOG" 2>&1
echo "retropi firstrun $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

restore_cmdline() {
  local f="$BOOT/cmdline.txt"
  [ -f "$f" ] || return 0
  if [ -f "$BOOT/cmdline.txt.retropi.bak" ]; then
    cp "$BOOT/cmdline.txt.retropi.bak" "$f"
  else
    sed -i \
      -e 's| systemd.run=[^ ]*||g' \
      -e 's| systemd.run_success_action=[^ ]*||g' \
      -e 's| systemd.unit=kernel-command-line.target||g' \
      "$f"
  fi
}

trap restore_cmdline EXIT

USERCONF="$BOOT/userconf.txt"
USERNAME=""
HASH=""
if [ -f "$USERCONF" ]; then
  USERNAME="$(cut -d: -f1 "$USERCONF" | tr -d '\r')"
  HASH="$(cut -d: -f2- "$USERCONF" | tr -d '\r')"
fi
[ -n "$USERNAME" ] || USERNAME="pi"

if ! getent passwd "$USERNAME" >/dev/null 2>&1; then
  grp_list="sudo,video,audio,input,users"
  for g in plugdev netdev gpio i2c spi; do
    getent group "$g" >/dev/null 2>&1 && grp_list="$grp_list,$g"
  done
  useradd -m -s /bin/bash -G "$grp_list" "$USERNAME" || true
fi
if [ -n "$HASH" ]; then
  echo "$USERNAME:$HASH" | chpasswd -e || true
fi
if getent group sudo >/dev/null 2>&1; then
  usermod -aG sudo "$USERNAME" || true
fi
echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/010-$USERNAME"
chmod 440 "/etc/sudoers.d/010-$USERNAME" || true

install -d -m 700 -o "$USERNAME" -g "$USERNAME" "/home/$USERNAME/.ssh"
if [ -f "$BOOT/retropi_authorized_keys" ]; then
  install -m 600 -o "$USERNAME" -g "$USERNAME" \
    "$BOOT/retropi_authorized_keys" "/home/$USERNAME/.ssh/authorized_keys"
fi

systemctl enable ssh 2>/dev/null || true
systemctl enable sshd 2>/dev/null || true
touch "$BOOT/ssh"
rm -f /etc/xdg/autostart/piwiz.desktop

install -d -m 755 /opt/retro-pi
if [ -f "$BOOT/retropi.tar.gz" ]; then
  stage="$(mktemp -d /tmp/retropi-unpack.XXXXXX)"
  tar -xzf "$BOOT/retropi.tar.gz" -C "$stage"
  src="$(find "$stage" -maxdepth 2 -type d -name bin | head -1)"
  if [ -n "$src" ]; then
    src="$(dirname "$src")"
    rm -rf /opt/retro-pi
    mv "$src" /opt/retro-pi
  fi
  rm -rf "$stage"
fi
chown -R "$USERNAME:$USERNAME" /opt/retro-pi
echo "$USERNAME" > /opt/retro-pi/.retropi-user

install -d /etc/systemd/system
cat > /etc/systemd/system/retropi-firstboot.service <<'__UNIT__'
[Unit]
Description=retro-pi first-boot install
After=network-online.target
Wants=network-online.target
ConditionPathExists=/opt/retro-pi/platforms/raspberrypi/firstboot.sh
ConditionPathExists=!/var/lib/retropi/installed

[Service]
Type=oneshot
ExecStart=/opt/retro-pi/platforms/raspberrypi/firstboot.sh
RemainAfterExit=yes
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
__UNIT__
systemctl daemon-reload
systemctl enable retropi-firstboot.service

if command -v raspi-config >/dev/null 2>&1; then
  raspi-config nonint do_ssh 0 || true
  raspi-config nonint do_boot_behaviour B4 || true
fi

echo "firstrun complete"
exit 0
