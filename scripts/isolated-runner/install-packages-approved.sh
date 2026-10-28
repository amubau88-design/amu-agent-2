#!/bin/sh
# Reviewed one-time provisioning. Run only after the owner's explicit package approval.
set -eu
export LC_ALL=C DEBIAN_FRONTEND=noninteractive
[ "${1:-}" = --owner-approved ]
[ "$(id -u)" = 0 ]
[ "${WSL_DISTRO_NAME:-}" = AMU-Runner ]
grep -qx 'VERSION_ID="24.04"' /etc/os-release
[ "$(uname -m)" = x86_64 ]
! command -v docker >/dev/null
! command -v node >/dev/null
test ! -e /etc/apt/sources.list.d/docker.sources
test ! -e /etc/apt/keyrings/docker.asc
test ! -e /root/amu-session26
mkdir -m 700 /root/amu-session26
cd /root/amu-session26
dpkg-query -W > packages-before.txt
curl --fail --silent --show-error --location https://download.docker.com/linux/ubuntu/gpg -o docker.asc
gpg --batch --with-colons --show-keys docker.asc > docker-key.txt
[ "$(awk -F: '$1=="fpr"{print $10;exit}' docker-key.txt)" = 9DC858229FC7DD38854AE2D88D81803C0EBFCD88 ]
install -d -m 755 /etc/apt/keyrings
install -m 644 docker.asc /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<'REPO'
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
REPO
apt-get update -o Acquire::Languages=none > apt-update.log 2>&1
version='5:29.8.2-1~ubuntu.24.04~noble'
apt-cache policy docker-ce docker-ce-cli docker-ce-rootless-extras containerd.io docker-buildx-plugin > candidates.txt
packages="uidmap dbus-user-session slirp4netns fuse-overlayfs iptables docker-ce=$version docker-ce-cli=$version docker-ce-rootless-extras=$version containerd.io docker-buildx-plugin"
apt-get -s --no-install-recommends --no-upgrade install $packages > install-plan.txt
if grep -Eq '^Remv |^Inst [^ ]+ \[' install-plan.txt; then echo 'Removal or existing-package upgrade requires new review' >&2; exit 1; fi
new=$(awk '/^Inst /{print $2}' install-plan.txt)
installed_kib=$(apt-cache --no-all-versions show $new | awk '/^Installed-Size:/{n+=$2}END{print n+0}')
apt-get --print-uris --yes --no-install-recommends --no-upgrade --download-only install $packages > download-plan.txt
download_bytes=$(awk "/^'https?:/{n+=\$3}END{print n+0}" download-plan.txt)
printf 'installedKiB=%s\ndownloadBytes=%s\n' "$installed_kib" "$download_bytes" > resource-plan.txt
# Bound installed packages + retained download cache; another 256 MiB is reserved for Node.
[ "$installed_kib" -gt 0 ]
[ $((installed_kib * 1024 + download_bytes)) -le 2415919104 ]
[ "$(df -PB1 / | awk 'NR==2{print $4}')" -ge 5368709120 ]
for unit in docker.service docker.socket containerd.service; do
  test ! -e "/etc/systemd/system/$unit"
  test ! -L "/etc/systemd/system/$unit"
  ln -s /dev/null "/etc/systemd/system/$unit"
done
systemctl daemon-reload
apt-get --yes --no-install-recommends --no-upgrade install $packages > apt-install.log 2>&1
for unit in docker.service docker.socket containerd.service; do
  [ "$(systemctl is-enabled "$unit" 2>/dev/null || true)" = masked ]
  ! systemctl is-active --quiet "$unit"
done
test ! -S /var/run/docker.sock
curl --fail --silent --show-error --location https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.xz -o node-v24.22.1-linux-x64.tar.xz
printf '%s  %s\n' 6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6 node-v24.22.1-linux-x64.tar.xz | sha256sum -c -
test ! -e /opt/node-v24.22.1-linux-x64
test ! -e /usr/local/bin/node
test ! -e /usr/local/bin/npm
tar -xJf node-v24.22.1-linux-x64.tar.xz -C /opt --no-same-owner
ln -s /opt/node-v24.22.1-linux-x64/bin/node /usr/local/bin/node
ln -s /opt/node-v24.22.1-linux-x64/bin/npm /usr/local/bin/npm
[ "$(/usr/local/bin/node --version)" = v24.22.1 ]
test ! -e /etc/systemd/system/user@.service.d/amu-delegate.conf
mkdir -p /etc/systemd/system/user@.service.d
printf '[Service]\nDelegate=cpu cpuset io memory pids\n' > /etc/systemd/system/user@.service.d/amu-delegate.conf
systemctl daemon-reload
loginctl enable-linger amu-runner
systemctl restart user@1000.service
dpkg-query -W > packages-after.txt
echo 'Approved Linux packages and Node installed; rootful services masked; no image or container started'
