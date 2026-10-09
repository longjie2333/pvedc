#!/bin/bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo 'Run this installer as root on the PVE node.' >&2; exit 1; fi
if [[ ! -d /etc/pve ]]; then echo 'This installer requires a Proxmox VE node.' >&2; exit 1; fi
SOURCE=$(cd "$(dirname "$0")/.." && pwd)
if [[ "$SOURCE" != '/opt/pvedc' ]]; then echo 'Extract the source into /opt/pvedc first.' >&2; exit 1; fi
export DEBIAN_FRONTEND=noninteractive
WORK=$(mktemp -d /tmp/pvedc-install.XXXXXX)
trap 'rm -rf -- "$WORK"' EXIT
. /etc/os-release
cat > "$WORK/debian.sources" <<EOF
Types: deb
URIs: https://deb.debian.org/debian
Suites: $VERSION_CODENAME $VERSION_CODENAME-updates
Components: main
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg

Types: deb
URIs: https://security.debian.org/debian-security
Suites: $VERSION_CODENAME-security
Components: main
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg
EOF
APT_SOURCE=(-o "Dir::Etc::sourcelist=$WORK/debian.sources" -o 'Dir::Etc::sourceparts=-')
apt-get "${APT_SOURCE[@]}" update
apt-get "${APT_SOURCE[@]}" install -y curl ca-certificates python3 sudo make g++ xz-utils
id pvedc >/dev/null 2>&1 || useradd --system --home /var/lib/pvedc --shell /usr/sbin/nologin pvedc
install -d -m 755 /opt/pvedc-runtime /usr/local/libexec
cd "$WORK"
NODE=node-v24.21.0-linux-x64.tar.xz
if [[ ! -x /opt/pvedc-runtime/bin/node ]] || [[ $(/opt/pvedc-runtime/bin/node --version) != v24.21.0 ]]; then
  curl --fail --silent --show-error --location --connect-timeout 15 --max-time 180 --retry 2 -o "$NODE" "https://nodejs.org/dist/v24.21.0/$NODE"
  echo 'fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6  node-v24.21.0-linux-x64.tar.xz' | sha256sum --check -
  tar -xJf "$NODE" --strip-components=1 -C /opt/pvedc-runtime
fi
export PATH=/opt/pvedc-runtime/bin:$PATH
npm install --global pnpm@10.33.2
GOST=gost_3.3.0_linux_amd64.tar.gz
if [[ -f /var/cache/pvedc/$GOST ]]; then
  cp "/var/cache/pvedc/$GOST" "$GOST"
else
  curl --fail --silent --show-error --location --connect-timeout 15 --max-time 180 --retry 2 -o "$GOST" "https://github.com/go-gost/gost/releases/download/v3.3.0/$GOST"
fi
echo '676fb7f78d267b6ae73df719c0c7f2b565dde7147da935cfafbc1e1da558b6d5  gost_3.3.0_linux_amd64.tar.gz' | sha256sum --check -
tar -xzf "$GOST" gost
install -m 755 gost /usr/local/bin/pvedc-gost
install -m 755 "$SOURCE/deploy/pvedc-helper.py" /usr/local/libexec/pvedc-helper
printf '%s\n' 'pvedc ALL=(root) NOPASSWD: /usr/local/libexec/pvedc-helper' > /etc/sudoers.d/pvedc
chmod 440 /etc/sudoers.d/pvedc
visudo -cf /etc/sudoers.d/pvedc
python3 "$SOURCE/deploy/bootstrap.py"
cd "$SOURCE"
chown -R pvedc:pvedc /opt/pvedc
runuser -u pvedc -- env PATH="$PATH" pnpm install --frozen-lockfile
runuser -u pvedc -- env PATH="$PATH" pnpm build
install -m 644 deploy/pvedc.service /etc/systemd/system/pvedc.service
install -m 644 deploy/pvedc-gost.service /etc/systemd/system/pvedc-gost.service
systemctl daemon-reload
systemctl enable --now pvedc-gost.service
systemctl enable pvedc.service
systemctl restart pvedc.service
echo 'Installed. Open http://<PVE-IP>:3000 to bind TOTP and configure allocation.'
