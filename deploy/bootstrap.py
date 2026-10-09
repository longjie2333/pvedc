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
if gost_config.exists():
    config = json.loads(gost_config.read_text())
else:
    config = {'api': {'addr': '127.0.0.1:18080', 'auth': {'username': 'pvedc', 'password': secrets.token_urlsafe(32)}}, 'services': []}
    gost_config.write_text(json.dumps(config, indent=2))
gost_config.chmod(0o600)
os.chown(gost_config, account.pw_uid, account.pw_gid)
settings.update(gostApi='http://127.0.0.1:18080', gostUser=config['api']['auth']['username'], gostPassword=config['api']['auth']['password'])
if os.environ.get('PDC_INITIAL_SETTINGS'):
    settings.update(json.loads(os.environ['PDC_INITIAL_SETTINGS']))
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
