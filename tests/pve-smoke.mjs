// Run only on the designated development PVE, against the isolated test service.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateSync } from 'otplib';
import { randomBytes, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';

const origin = 'http://127.0.0.1:3111';
const file = '/var/lib/pvedc-integration-state.json';
const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const save = () => writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
const log = (message, value) => console.log(message, value === undefined ? '' : JSON.stringify(value));
async function api(path, body, cookie = state.cookie, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(origin + '/api/' + path, { method, headers: { Origin: origin, Cookie: cookie || '', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) throw new Error(path + ': ' + response.status + ' ' + value.error);
  return { value, cookie: response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') };
}
async function login() {
  if (!(await api('setup/status')).value.initialized) {
    const setup = await api('setup/begin', {}); state.secret = setup.value.secret;
    state.cookie = (await api('setup/complete', { code: generateSync({ secret: state.secret }) }, setup.cookie)).cookie;
    save();
  }
  if (!(await api('auth/session')).value.actor) {
    state.cookie = (await api('auth/admin', { code: generateSync({ secret: state.secret }) })).cookie; save();
  }
}
async function job(id, timeout = 600000) {
  const deadline = Date.now() + timeout; let last = '';
  while (Date.now() < deadline) {
    const task = (await api('admin/tasks/' + id)).value;
    assert(task, 'job not found');
    if (task.state + task.step !== last) { log('task', { id, state: task.state, step: task.step, error: task.error }); last = task.state + task.step; }
    if (task.state === 'succeeded') return task;
    if (['attention', 'failed'].includes(task.state)) throw new Error(task.error);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Timed out waiting for task ' + id);
}
async function sshCommand(command, host = state.ip, port = 22, password = state.password) {
  const { Client } = await import('ssh2');
  const ssh = new Client();
  return new Promise((resolve, reject) => {
    ssh.on('error', reject).on('ready', () => ssh.exec(command, (error, stream) => {
      if (error) { ssh.end(); return reject(error); }
      let data = ''; stream.on('data', chunk => data += chunk).on('close', code => { ssh.end(); resolve({ code, data: data.trim() }); });
    })).connect({ host, port, username: 'root', password, readyTimeout: 15000 });
  });
}
async function studentLogin() {
  if (state.studentCookie && (await api('auth/session', undefined, state.studentCookie)).value.actor?.sub === state.studentId) return;
  state.studentCookie = (await api('auth/student', { studentId: state.studentId, password: state.password })).cookie; save();
}

for (let attempt = 0; ; attempt++) {
  try { await fetch(origin + '/api/setup/status'); break; }
  catch (error) { if (attempt >= 40) throw error; await new Promise(resolve => setTimeout(resolve, 250)); }
}
await login();
const stage = process.argv[2] || 'inspect';
if (stage === 'inspect') {
  const inventory = (await api('admin/inventory')).value;
  log('inventory', { cpus: inventory.node.cpuinfo.cpus, memory: inventory.node.memory.total, guests: inventory.configs.length, interfaces: inventory.interfaces.map(i => i.iface) });
  const templates = (await api('admin/templates')).value;
  log('templates', { available: templates.catalog.map(t => t.template), downloaded: templates.downloaded.map(t => t.volid) });
}
if (stage === 'prepare') {
  await api('admin/settings', { vmidStart: 990000, vmidEnd: 990009, reserveCpu: 2, reserveMemory: 4096, reserveDisk: 10, webLocalPort: 3111, webTunnelPort: 18082 });
  const templates = (await api('admin/templates')).value;
  for (const distro of ['debian', 'ubuntu']) {
    const template = templates.catalog.find(t => t.template.startsWith(distro === 'debian' ? 'debian-13-' : 'ubuntu-24.04-'));
    assert(template, 'missing official ' + distro + ' template');
    state[distro + 'Template'] = 'local:vztmpl/' + template.template; save();
    if (!templates.downloaded.some(t => t.volid === state[distro + 'Template'])) await job((await api('admin/templates/download', { storage: 'local', template: template.template })).value.taskId);
  }
  const overview = (await api('admin/overview')).value;
  state.networkId ||= overview.networks.find(n => n.name === 'INTEGRATION NAT')?.id;
  if (!state.networkId) {
    const network = await api('admin/networks', { name: 'INTEGRATION NAT', mode: 'nat', bridge: 'dcitest', cidr: '172.31.249.0/24', gateway: '172.31.249.1', start: '172.31.249.10', end: '172.31.249.20', dns: ['223.5.5.5'], excluded: [], vlan: null });
    state.networkId = network.value.id; save();
  }
  await job((await api('admin/networks/' + state.networkId + '/apply', {})).value.taskId);
  log('prepared', { networkId: state.networkId });
}
if (stage === 'retry') {
  const id = process.argv[3]; assert(id);
  await api('admin/tasks/' + id + '/retry', {}); await job(id);
}
if (stage === 'overview') {
  const overview = (await api('admin/overview')).value;
  log('overview', { networks: overview.networks, resources: overview.resources, taskCounts: overview.taskCounts });
}
if (stage === 'create') {
  const overview = (await api('admin/overview')).value;
  state.profileId ||= overview.profiles.find(p => p.name === 'INTEGRATION DEBIAN')?.id;
  if (!state.profileId) {
    state.profileId = (await api('admin/profiles', { name: 'INTEGRATION DEBIAN', enabled: true, published: true, template: state.debianTemplate, distro: 'debian', storage: 'local-lvm', cores: 1, memory: 512, swap: 0, disk: 4, networkId: state.networkId, nesting: false })).value.id;
    save();
  }
  await api('admin/settings', { defaultProfileId: state.profileId, registrationOpen: true });
  state.studentId = '99000001'; state.password ||= randomBytes(18).toString('base64url'); save();
  await api('admin/students', { id: state.studentId, name: 'INTEGRATION TEST ONLY', className: 'DISPOSABLE' });
  const known = (await api('admin/overview')).value.resources.find(r => r.studentId === state.studentId);
  if (!known) {
    const claim = await api('public/claim', { studentId: state.studentId, password: state.password });
    state.studentCookie = claim.cookie; state.createJob = claim.value.taskId; save();
    await job(state.createJob);
  }
  const resource = (await api('me/overview', undefined, state.studentCookie)).value.resource;
  state.resourceId = resource.id; state.ip = resource.ip; state.vmid = resource.vmid; save();
  log('created', { vmid: resource.vmid, ip: resource.ip, state: resource.state });
}
if (stage === 'verify') {
  const { Client } = await import('ssh2');
  const login = await api('auth/student', { studentId: state.studentId, password: state.password }); state.studentCookie = login.cookie; save();
  const metrics = (await api('me/status', undefined, state.studentCookie)).value;
  const ports = (await api('me/ports', undefined, state.studentCookie)).value;
  assert.equal(metrics.data.status, 'running'); assert(ports.data.some(p => p.port === 22 && p.protocol === 'tcp'));
  const ssh = new Client();
  const result = await new Promise((resolve, reject) => {
    ssh.on('error', reject).on('ready', () => ssh.exec('hostname; id -u', (error, stream) => {
      if (error) return reject(error);
      let data = ''; stream.on('data', chunk => data += chunk).on('close', () => { ssh.end(); resolve(data.trim()); });
    })).connect({ host: state.ip, username: 'root', password: state.password, readyTimeout: 10000 });
  });
  assert.equal(result, state.studentId + '\n0');
  log('verified', { status: metrics.data.status, listeningPorts: ports.data.map(p => p.port), hostnameAndUid: result });
}
if (stage === 'relay') {
  const relay = JSON.parse(readFileSync('/var/cache/pvedc/relay-test.json', 'utf8'));
  const ca = readFileSync('/var/cache/pvedc/relay-ca.pem', 'utf8');
  assert.equal(new X509Certificate(ca).fingerprint256, '5D:E2:53:2E:8C:86:72:A0:29:1C:FF:EB:02:84:11:61:AE:E3:47:2D:84:EF:AE:57:D9:AE:F5:D2:69:A4:70:CE');
  await api('admin/settings', { ...relay, relayCa: ca });
  await job((await api('admin/gost/apply', {})).value.taskId);
  const login = await api('auth/student', { studentId: state.studentId, password: state.password }); state.studentCookie = login.cookie; save();
  const result = await api('me/forwards', { protocol: 'tcp', targetPort: 22, note: 'DISPOSABLE INTEGRATION SSH' }, state.studentCookie);
  state.forwardId = result.value.id; state.publicPort = result.value.publicPort; save();
  await job(result.value.taskId);
  log('relay-applied', { publicHost: relay.publicHost, publicPort: state.publicPort });
}
if (stage === 'relay-verify') {
  const relay = JSON.parse(readFileSync('/var/cache/pvedc/relay-test.json', 'utf8'));
  const result = await sshCommand('hostname', relay.publicHost, state.publicPort);
  assert.equal(result.data, state.studentId);
  log('public-ssh-verified', { host: relay.publicHost, port: state.publicPort, hostname: result.data });
}
if (stage === 'password') {
  await studentLogin();
  const oldPassword = state.password;
  state.nextPassword ||= randomBytes(18).toString('base64url'); save();
  state.passwordJob = (await api('me/resource/password', { password: oldPassword, newPassword: state.nextPassword }, state.studentCookie)).value.taskId; save();
  await job(state.passwordJob);
  state.password = state.nextPassword; delete state.nextPassword; save();
  await assert.rejects(() => api('auth/student', { studentId: state.studentId, password: oldPassword }), /401/);
  await studentLogin();
  assert.equal((await sshCommand('hostname')).data, state.studentId);
  log('password-sync-verified');
}
if (stage === 'rebuild') {
  await studentLogin();
  const before = (await api('me/overview', undefined, state.studentCookie)).value;
  assert.equal((await sshCommand('touch /root/pvedc-rebuild-marker')).code, 0);
  const task = (await api('me/resource/rebuild', { password: state.password, confirmation: state.studentId }, state.studentCookie)).value.taskId;
  state.rebuildJob = task; save(); await job(task);
  await studentLogin();
  const after = (await api('me/overview', undefined, state.studentCookie)).value;
  assert.equal(after.resource.ip, before.resource.ip); assert.equal(after.resource.vmid, before.resource.vmid);
  assert.deepEqual(after.resource.spec, before.resource.spec);
  assert.deepEqual(after.forwards.map(f => [f.id, f.publicPort]), before.forwards.map(f => [f.id, f.publicPort]));
  assert.equal((await sshCommand('test ! -e /root/pvedc-rebuild-marker && hostname')).data, state.studentId);
  log('rebuild-verified', { vmid: after.resource.vmid, ip: after.resource.ip, forwards: after.forwards.length });
}
if (stage === 'power') {
  await studentLogin();
  await job((await api('me/resource/shutdown', {}, state.studentCookie)).value.taskId);
  await new Promise(r => setTimeout(r, 5000));
  assert.equal((await api('me/status', undefined, state.studentCookie)).value.data.status, 'stopped');
  await job((await api('me/resource/start', {}, state.studentCookie)).value.taskId);
  await new Promise(r => setTimeout(r, 5000));
  assert.equal((await api('me/status', undefined, state.studentCookie)).value.data.status, 'running');
  await job((await api('me/resource/reboot', {}, state.studentCookie)).value.taskId);
  log('power-operations-verified');
}
if (stage === 'bridge') {
  const overview = (await api('admin/overview')).value;
  state.bridgeId ||= overview.networks.find(n => n.name === 'INTEGRATION BRIDGE')?.id;
  if (!state.bridgeId) {
    state.bridgeId = (await api('admin/networks', { name: 'INTEGRATION BRIDGE', mode: 'bridge', bridge: 'dcitest', cidr: '172.31.249.0/24', gateway: '172.31.249.1', start: '172.31.249.30', end: '172.31.249.40', dns: ['223.5.5.5'], excluded: [], vlan: null })).value.id;
    save();
  }
  await job((await api('admin/networks/' + state.bridgeId + '/apply', {})).value.taskId);
  state.ubuntuProfile ||= overview.profiles.find(p => p.name === 'INTEGRATION UBUNTU')?.id;
  if (!state.ubuntuProfile) {
    state.ubuntuProfile = (await api('admin/profiles', { name: 'INTEGRATION UBUNTU', enabled: true, published: false, template: state.ubuntuTemplate, distro: 'ubuntu', storage: 'local-lvm', cores: 1, memory: 512, swap: 0, disk: 4, networkId: state.bridgeId, nesting: true })).value.id;
    save();
  }
  await api('admin/settings', { selfSelection: true });
  await api('admin/students', { id: '99000002', name: 'INTEGRATION BRIDGE TEST', className: 'DISPOSABLE', profileId: state.ubuntuProfile });
  state.secondPassword ||= randomBytes(18).toString('base64url'); save();
  const known = (await api('admin/overview')).value.resources.find(r => r.studentId === '99000002');
  if (!known) {
    const claim = await api('public/claim', { studentId: '99000002', password: state.secondPassword, profileId: state.profileId });
    state.secondCookie = claim.cookie; state.secondJob = claim.value.taskId; save(); await job(state.secondJob);
  } else state.secondCookie = (await api('auth/student', { studentId: '99000002', password: state.secondPassword })).cookie;
  const resource = (await api('me/overview', undefined, state.secondCookie)).value.resource;
  state.secondResourceId = resource.id; state.secondIp = resource.ip; save();
  assert.equal(resource.profileId, state.ubuntuProfile); assert.equal(resource.spec.distro, 'ubuntu'); assert.equal(resource.network.mode, 'bridge');
  assert.equal((await sshCommand('hostname', resource.ip, 22, state.secondPassword)).data, '99000002');
  assert.equal((await sshCommand('timeout 90 apt-get update >/tmp/pvedc-network-test.log 2>&1', resource.ip, 22, state.secondPassword)).code, 0);
  log('bridge-and-assignment-verified', { vmid: resource.vmid, ip: resource.ip, distro: resource.spec.distro });
}
if (stage === 'range') {
  const overview = (await api('admin/overview')).value;
  for (const rule of overview.forwards.filter(f => f.publicPort <= 11000 || f.publicPort > 11010)) {
    await job((await api('admin/forwards/' + rule.id + '/delete', {})).value.taskId);
  }
  await api('admin/settings', { portStart: 11000, portEnd: 11010, reservedPorts: [11000] });
  await studentLogin();
  const current = (await api('me/overview', undefined, state.studentCookie)).value.forwards.find(f => f.protocol === 'tcp' && f.targetPort === 22);
  if (current) { state.forwardId = current.id; state.publicPort = current.publicPort; }
  else {
    const result = (await api('me/forwards', { protocol: 'tcp', targetPort: 22, note: 'DISPOSABLE INTEGRATION SSH' }, state.studentCookie)).value;
    await job(result.taskId); state.forwardId = result.id; state.publicPort = result.publicPort;
  }
  save(); log('test-port-range-updated', { start: 11000, end: 11010, publicPort: state.publicPort });
}
if (stage === 'certificate') {
  const ca = readFileSync('/var/cache/pvedc/relay-ca-next.pem', 'utf8');
  assert.equal(new X509Certificate(ca).fingerprint256, 'A2:4F:49:32:EE:A5:C4:2D:27:2B:BB:96:F4:08:54:52:33:F0:B1:D7:62:7C:E4:11:F3:C0:1F:D1:2D:B4:B0:C4');
  await api('admin/settings', { relayCa: ca });
  await job((await api('admin/gost/apply', {})).value.taskId);
  log('persistent-relay-certificate-applied');
}
if (stage === 'udp') {
  await studentLogin();
  if ((await sshCommand('command -v python3')).code !== 0) assert.equal((await sshCommand('apt-get update >/tmp/pvedc-apt.log 2>&1 && apt-get install -y python3 >>/tmp/pvedc-apt.log 2>&1')).code, 0);
  const program = "import socket\ns=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)\ns.bind(('0.0.0.0',8089))\nwhile True:\n data,peer=s.recvfrom(2048)\n s.sendto(b'pvedc:'+data,peer)\n";
  const encoded = Buffer.from(program).toString('base64');
  if (!(await sshCommand("ss -H -lun 'sport = :8089'")).data) assert.equal((await sshCommand("printf '%s' '" + encoded + "' | base64 -d > /tmp/pvedc-udp.py; nohup python3 /tmp/pvedc-udp.py >/tmp/pvedc-udp.log 2>&1 </dev/null &")).code, 0);
  let rule = (await api('me/overview', undefined, state.studentCookie)).value.forwards.find(f => f.protocol === 'udp' && f.targetPort === 8089);
  if (!rule) {
    const created = (await api('me/forwards', { protocol: 'udp', targetPort: 8089, note: 'DISPOSABLE UDP ECHO' }, state.studentCookie)).value;
    state.udpRule = created.id; state.udpPort = created.publicPort; save(); await job(created.taskId);
    rule = { id: created.id, publicPort: created.publicPort };
  }
  const { createSocket } = await import('node:dgram');
  const target = JSON.parse(readFileSync('/var/cache/pvedc/relay-test.json', 'utf8')).publicHost;
  const nonce = randomBytes(12).toString('hex');
  const received = await new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    const timer = setTimeout(() => { clearInterval(retry); socket.close(); reject(new Error('Public UDP echo timed out')); }, 15000);
    const retry = setInterval(() => socket.send(nonce, rule.publicPort, target), 1000);
    socket.on('message', message => { clearTimeout(timer); clearInterval(retry); socket.close(); resolve(message.toString()); });
    socket.on('error', error => { clearTimeout(timer); clearInterval(retry); socket.close(); reject(error); });
    socket.send(nonce, rule.publicPort, target);
  });
  assert.equal(received, 'pvedc:' + nonce);
  log('public-udp-verified', { host: target, port: rule.publicPort });
}
if (stage === 'restart') {
  await api('admin/students', { id: '99000003', name: 'INTEGRATION RESTART TEST', className: 'DISPOSABLE' });
  state.thirdPassword ||= randomBytes(18).toString('base64url'); save();
  const existing = (await api('admin/overview')).value.resources.find(r => r.studentId === '99000003');
  if (!existing) {
    const claim = await api('public/claim', { studentId: '99000003', password: state.thirdPassword, profileId: state.profileId });
    state.thirdJob = claim.value.taskId; save();
    const db = new Database('/var/lib/pvedc-integration/pvedc.sqlite', { readonly: true });
    const deadline = Date.now() + 30000; let observed = false;
    while (Date.now() < deadline) {
      const task = db.prepare('SELECT step,upid FROM jobs WHERE id=?').get(state.thirdJob);
      if (task?.step === 'create-wait' && task.upid) { observed = true; break; }
      await new Promise(r => setTimeout(r, 100));
    }
    db.close(); assert(observed, 'Did not observe durable PVE task before restart');
    execFileSync('systemctl', ['restart', 'pvedc-integration']);
    for (let attempt = 0; ; attempt++) {
      try { await fetch(origin + '/api/setup/status'); break; }
      catch (error) { if (attempt > 40) throw error; await new Promise(r => setTimeout(r, 250)); }
    }
    await job(state.thirdJob);
  }
  const matches = (await api('admin/overview')).value.resources.filter(r => r.studentId === '99000003');
  assert.equal(matches.length, 1); assert.equal(matches[0].state, 'ready');
  state.thirdResourceId = matches[0].id; save(); log('backend-restart-recovery-verified', { vmid: matches[0].vmid, ip: matches[0].ip });
}
if (stage === 'gost-restart') {
  execFileSync('systemctl', ['restart', 'pvedc-gost']);
  const host = JSON.parse(readFileSync('/var/cache/pvedc/relay-test.json', 'utf8')).publicHost;
  let result;
  for (let attempt = 0; attempt < 15; attempt++) {
    try { result = await sshCommand('hostname', host, state.publicPort); break; }
    catch (error) { if (attempt === 14) throw error; await new Promise(r => setTimeout(r, 2000)); }
  }
  assert.equal(result.data, state.studentId); log('gost-restart-recovery-verified', { port: state.publicPort });
}
if (stage === 'web') {
  const settings = (await api('admin/settings', { webBindHost: '172.19.0.1', webTunnelPort: 18081, webLocalPort: 3000 })).value;
  assert.equal(settings.webBindHost, '172.19.0.1');
  await job((await api('admin/gost/apply', {})).value.taskId);
  log('production-web-tunnel-applied', { address: '172.19.0.1:18081', target: '127.0.0.1:3000' });
}
if (stage === 'cleanup') {
  const overview = (await api('admin/overview')).value;
  const allowedResources = new Set([state.resourceId, state.secondResourceId, state.thirdResourceId]);
  for (const resource of overview.resources) {
    assert(allowedResources.has(resource.id) && /^9900000[123]$/.test(resource.studentId) && resource.vmid >= 990000 && resource.vmid <= 990002, 'Refuse to clean an unrecognized resource');
    await job((await api('admin/resources/' + resource.id + '/reclaim', { confirmation: resource.studentId })).value.taskId);
  }
  await api('admin/settings', { registrationOpen: false, defaultProfileId: null });
  const current = (await api('admin/overview')).value;
  for (const student of current.students) {
    assert(/^9900000[123]$/.test(student.id), 'Refuse to delete an unrecognized student');
    await api('admin/students/' + student.id, {}, state.cookie, 'DELETE');
  }
  for (const profile of current.profiles) {
    assert([state.profileId, state.ubuntuProfile].includes(profile.id), 'Refuse to delete an unrecognized profile');
    await api('admin/profiles/' + profile.id, {}, state.cookie, 'DELETE');
  }
  for (const network of current.networks.sort((a, b) => a.mode === 'bridge' ? -1 : b.mode === 'bridge' ? 1 : 0)) {
    assert([state.networkId, state.bridgeId].includes(network.id), 'Refuse to delete an unrecognized network');
    await job((await api('admin/networks/' + network.id + '/remove', {})).value.taskId);
    await api('admin/networks/' + network.id, {}, state.cookie, 'DELETE');
  }
  const after = (await api('admin/overview')).value;
  assert.equal(after.resources.length, 0); assert.equal(after.forwards.length, 0); assert.equal(after.networks.length, 0); assert.equal(after.students.length, 0);
  log('test-resources-cleaned', { resources: 0, forwards: 0, networks: 0, students: 0 });
}
