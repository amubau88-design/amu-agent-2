#!/bin/sh
# Dedicated CPU-only WSL runner: remove known Windows driver and executable bridges.
set -eu
[ "$(id -u)" -eq 0 ] || exit 1
target=/usr/lib/wsl/drivers
if mountpoint -q "$target"; then
  [ "$(findmnt -n -o FSTYPE --target "$target")" = 9p ] || exit 1
  [ "$(findmnt -n -o SOURCE --target "$target")" = drivers ] || exit 1
  case ",$(findmnt -n -o OPTIONS --target "$target")," in
    *,ro,*) ;;
    *) exit 1 ;;
  esac
  umount "$target"
fi
! mountpoint -q "$target"
interop=/proc/sys/fs/binfmt_misc/WSLInterop
if [ -e "$interop" ]; then
  grep -qx 'interpreter /init' "$interop" || exit 1
  grep -qx 'magic 4d5a' "$interop" || exit 1
  printf '%s\n' -1 > "$interop"
fi
[ ! -e "$interop" ]
# Apply only after the separate owner-approved WSL core policy is installed.
if [ -f /etc/sysctl.d/60-amu-runner-core.conf ]; then
  grep -qx 'kernel.core_pattern=core' /etc/sysctl.d/60-amu-runner-core.conf || exit 1
  case "$(cat /proc/sys/kernel/core_pattern)" in
    core|'|/wsl-capture-crash '*) printf '%s\n' core > /proc/sys/kernel/core_pattern ;;
    *) exit 1 ;;
  esac
fi
