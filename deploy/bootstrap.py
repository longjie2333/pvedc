#!/usr/bin/python3
"""Provision the dedicated API identity and local credentials without printing secrets."""
import json
import os
import pathlib
import pwd
import secrets
import socket
import subprocess
import uuid
import ipaddress
import re
from urllib.parse import urlsplit

root = pathlib.Path('/etc/pvedc')
root.mkdir(mode=0o750, exist_ok=True)
data = pathlib.Path('/var/lib/pvedc')
data.mkdir(mode=0o700, exist_ok=True)
account = pwd.getpwnam('pvedc')
os.chown(root, 0, account.pw_gid)
os.chown(data, account.pw_uid, account.pw_gid)


def command(*args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('PVE account operation failed: ' + result.stderr.strip())
    return json.loads(result.stdout) if result.stdout.strip() else None


identity = root / 'instance-id'
if not identity.exists():
    identity.write_text(str(uuid.uuid4()))
identity.chmod(0o640)
os.chown(identity, 0, account.pw_gid)
bootstrap = root / 'bootstrap.json'
settings = json.loads(bootstrap.read_text()) if bootstrap.exists() else {}
node = socket.gethostname().split('.')[0]
role = 'DistributionCenter'
privileges = 'Sys.Audit Sys.Modify SDN.Allocate SDN.Audit SDN.Use VM.Allocate VM.Audit VM.Config.CPU VM.Config.Memory VM.Config.Disk VM.Config.Network VM.Config.Options VM.PowerMgmt Datastore.Audit Datastore.AllocateSpace Datastore.AllocateTemplate'
roles = command('pveum', 'role', 'list', '--output-format', 'json')
command('pveum', 'role', 'modify' if any(r['roleid'] == role for r in roles) else 'add', role, '--privs', privileges)
users = command('pveum', 'user', 'list', '--output-format', 'json')
if not any(u['userid'] == 'pvedc@pve' for u in users):
    command('pveum', 'user', 'add', 'pvedc@pve', '--comment', 'PVE Distribution Center service')
command('pveum', 'acl', 'modify', '/', '--users', 'pvedc@pve', '--roles', role)
if not settings.get('pveTokenSecret'):
    tokens = command('pveum', 'user', 'token', 'list', 'pvedc@pve', '--output-format', 'json')
    if any(t['tokenid'] == 'web' for t in tokens):
        token = command('pveum', 'user', 'token', 'modify', 'pvedc@pve', 'web', '--regenerate', '1', '--privsep', '0', '--output-format', 'json')
    else:
        token = command('pveum', 'user', 'token', 'add', 'pvedc@pve', 'web', '--privsep', '0', '--output-format', 'json')
    settings['pveTokenSecret'] = token['value']
settings.update(pveUrl='https://' + node + ':8006', pveNode=node, pveTokenId='pvedc@pve!web', pveCa=pathlib.Path('/etc/pve/pve-root-ca.pem').read_text())
gost_dir = data / 'gost'
gost_dir.mkdir(mode=0o700, exist_ok=True)
os.chown(gost_dir, account.pw_uid, account.pw_gid)
gost_cert_dir = data / '.gost'
gost_cert_dir.mkdir(mode=0o700, exist_ok=True)
os.chown(gost_cert_dir, account.pw_uid, account.pw_gid)
gost_config = gost_dir / 'gost.json'
initial_settings = json.loads(os.environ.get('PDC_INITIAL_SETTINGS') or '{}')
initial_api = {**settings, **initial_settings}
for env_name, field in [('PDC_GOST_API', 'gostApi'), ('PDC_GOST_USER', 'gostUser'), ('PDC_GOST_PASSWORD', 'gostPassword')]:
    if os.environ.get(env_name):
        initial_api[field] = os.environ[env_name]
if gost_config.exists():
    config = json.loads(gost_config.read_text())
else:
    endpoint = urlsplit(initial_api.get('gostApi', 'http://127.0.0.1:18080'))
    if endpoint.scheme != 'http' or not endpoint.hostname or endpoint.username or endpoint.password or endpoint.query or endpoint.fragment:
        raise ValueError('GOST API requires a local HTTP address')
    hostname = '127.0.0.1' if endpoint.hostname == 'localhost' else endpoint.hostname
    address = ipaddress.IPv4Address(hostname)
    local_addresses = {entry['local'] for interface in command('ip', '-j', '-4', 'address') for entry in interface.get('addr_info', [])}
    if not (address.is_loopback or address.is_unspecified or hostname in local_addresses):
        raise ValueError('GOST API address must belong to the PVE host')
    port = endpoint.port if endpoint.port is not None else 80
    username, password = initial_api.get('gostUser') or 'pvedc', initial_api.get('gostPassword') or secrets.token_urlsafe(32)
    if not 1 <= port <= 65535 or not re.fullmatch(r'(/[A-Za-z0-9_-]+)*/?', endpoint.path):
        raise ValueError('Invalid GOST API port or path prefix')
    if not isinstance(username, str) or not isinstance(password, str) or any(char in username for char in ':\r\n\0') or any(char in password for char in '\r\n\0'):
        raise ValueError('Invalid GOST API credentials')
    config = {'api': {'addr': hostname + ':' + str(port), 'pathPrefix': endpoint.path.rstrip('/'),
                      'auth': {'username': username, 'password': password}}, 'services': []}
    gost_config.write_text(json.dumps(config, indent=2))
gost_config.chmod(0o600)
os.chown(gost_config, account.pw_uid, account.pw_gid)
api_addr = config['api']['addr']
if api_addr.startswith(':'):
    api_addr = '0.0.0.0' + api_addr
settings.update(gostApi='http://' + api_addr + config['api'].get('pathPrefix', '').rstrip('/'), gostUser=config['api']['auth']['username'], gostPassword=config['api']['auth']['password'])
settings.update({key: value for key, value in initial_settings.items() if key not in ('gostApi', 'gostUser', 'gostPassword')})
bootstrap.write_text(json.dumps(settings))
bootstrap.chmod(0o640)
os.chown(bootstrap, 0, account.pw_gid)
runtime = root / 'runtime.env'
if not runtime.exists():
    lines = ['PDC_INSTANCE_ID=' + identity.read_text().strip()]
    for key in ('PDC_TOTP_SECRET', 'PDC_MASTER_KEY'):
        if os.environ.get(key):
            value = os.environ[key]
            if any(c in value for c in '\r\n"\\'):
                raise ValueError('invalid environment secret')
            lines.append(key + '=' + value)
    runtime.write_text('\n'.join(lines) + '\n')
runtime.chmod(0o640)
os.chown(runtime, 0, account.pw_gid)
print('Local API identity and service credentials are configured.')
