#!/usr/bin/python3
"""Restricted, root-owned bridge for the operations PVE's LXC API lacks."""
import json
import pathlib
import re
import subprocess
import sys
import hmac


def execute(argv, data=None, timeout=30):
    result = subprocess.run(argv, input=data, text=True, capture_output=True, timeout=timeout, check=True)
    return result.stdout


def main():
    raw = sys.stdin.read(8193)
    if len(raw) > 8192:
        raise ValueError('request too large')
    request = json.loads(raw)
    operation, vmid = request.get('operation'), request.get('vmid')
    if operation == 'sdn-lock':
        path = pathlib.Path('/etc/pve/sdn/.lock')
        if not path.exists():
            return {'locked': False, 'owned': False}
        token = request.get('token')
        return {'locked': True, 'owned': isinstance(token, str) and hmac.compare_digest(path.read_text(), token)}
    if operation not in ('bootstrap', 'ports', 'password') or type(vmid) is not int or not 100 <= vmid <= 999999999:
        raise ValueError('invalid operation or VMID')
    instance = pathlib.Path('/etc/pvedc/instance-id').read_text().strip()
    if not re.fullmatch(r'[0-9a-f-]{36}', instance):
        raise ValueError('invalid installation identity')
    config = pathlib.Path('/etc/pve/lxc/' + str(vmid) + '.conf').read_text()
    tags = re.search(r'^tags:\s*(.*)$', config, re.MULTILINE)
    if not tags or 'pvedc-' + instance.replace('-', '') not in tags.group(1).split(';'):
        raise ValueError('container is not managed by this installation')
    prefix = ['/usr/sbin/pct', 'exec', str(vmid), '--']
    if operation == 'password':
        password = request.get('password')
        if not isinstance(password, str) or not 10 <= len(password) <= 128 or any(c in password for c in '\r\n\0:'):
            raise ValueError('invalid password')
        execute(prefix + ['/usr/sbin/chpasswd'], 'root:' + password + '\n')
        return {'ok': True}
    if operation == 'bootstrap':
        script = '''set -eu
. /etc/os-release
case "$ID" in ubuntu|debian) ;; *) exit 42 ;; esac
export DEBIAN_FRONTEND=noninteractive
for attempt in $(seq 1 30); do
  if systemctl is-active --quiet basic.target; then break; fi
  sleep 1
done
systemctl is-active --quiet basic.target
if ! command -v sshd >/dev/null 2>&1 || ! command -v ss >/dev/null 2>&1; then
  apt-get -o Acquire::Retries=2 update
  apt-get -o Acquire::Retries=2 install -y openssh-server iproute2 ca-certificates
fi
install -d -m 755 /etc/ssh/sshd_config.d
install -d -m 755 /run/sshd
printf '%s\n' 'PermitRootLogin yes' 'PasswordAuthentication yes' > /etc/ssh/sshd_config.d/00-pvedc.conf
ssh-keygen -A
/usr/sbin/sshd -t
systemctl enable --now ssh
systemctl restart ssh
systemctl is-active --quiet ssh
'''
        execute(prefix + ['/bin/sh', '-s'], script, timeout=280)
        return {'ok': True}
    rows = execute(prefix + ['/usr/bin/ss', '-H', '-lntup'])
    ports = []
    for line in rows.splitlines():
        columns = line.split(None, 6)
        if len(columns) < 6 or columns[0] not in ('tcp', 'udp'):
            continue
        address, port = columns[4].rsplit(':', 1)
        if not port.isdecimal():
            continue
        ports.append({'protocol': columns[0], 'address': address.strip('[]'), 'port': int(port), 'process': columns[6][:300] if len(columns) > 6 else ''})
    return ports


if __name__ == '__main__':
    try:
        print(json.dumps(main()))
    except Exception as error:
        # Do not print command stdin or credentials to journal/error responses.
        print(type(error).__name__, file=sys.stderr)
        sys.exit(1)
