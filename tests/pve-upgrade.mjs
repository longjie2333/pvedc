// Opt-in integration runner for the isolated upgrade instance, never the production database.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createSocket } from 'node:dgram';
import { execFileSync, spawnSync } from 'node:child_process';
import { generateSync } from 'otplib';
import { Client } from 'ssh2';

const origin = 'http://127.0.0.1:3111';
const root = '/var/lib/pvedc-upgrade-test';
const fixture = JSON.parse(readFileSync(root + '/fixture.json', 'utf8'));
const state = existsSync(root + '/state.json') ? JSON.parse(readFileSync(root + '/state.json', 'utf8')) : {};
const save = () => writeFileSync(root + '/state.json', JSON.stringify(state), { mode: 0o600 });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = (label, data) => console.log(label, data === undefined ? '' : JSON.stringify(data));
async function api(path, body, cookie = state.adminCookie || '', method = body === undefined ? 'GET' : 'POST', retry = true) {
  const response = await fetch(origin + '/api/' + path, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await response.json();
  const next = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  if (!response.ok && response.status === 401 && value.code === 'AUTH_REQUIRED' && retry) {
    const refreshed = await api('auth/refresh', {}, cookie, 'POST', false);
    for (const key of ['adminCookie', 'studentCookie', 'secondCookie']) if (state[key] === cookie) state[key] = refreshed.cookie;
    save(); return api(path, body, refreshed.cookie, method, false);
  }
  if (!response.ok) throw new Error(path + ': HTTP ' + response.status + ' ' + value.error);
  return { value, cookie: next };
}
async function waitTask(id, allowFailure = false) {
  const deadline = Date.now() + 480000; let previous = '';
  while (Date.now() < deadline) {
    const task = (await api('admin/tasks/' + id)).value;
    if (task.state + task.step !== previous) { log('task', { id, type: task.type, state: task.state, step: task.step, error: task.error }); previous = task.state + task.step; }
    if (task.state === 'succeeded') return task;
    if (['failed', 'attention'].includes(task.state)) { if (allowFailure) return task; throw new Error(task.error); }
    await sleep(1000);
  }
  throw new Error('Task timed out: ' + id);
}
async function batch(ids, action) {
  const confirmation = action === 'delete' ? `删除 ${ids.length} 名学生` : action === 'reclaim' ? `回收 ${ids.length} 名学生的资源` : '';
  const result = (await api('admin/students/batch', { ids, action, confirmation })).value;
  for (const item of result.items) if (item.taskId) await waitTask(item.taskId);
  if (result.items.some(item => item.taskId)) {
    const counts = (await api('admin/tasks/batch/' + result.batchId)).value;
    assert(counts.total === counts.succeeded, 'Batch tasks did not all succeed');
  }
  return result;
}
async function ssh(command, host, password, port = 22) {
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        const client = new Client();
        client.on('error', reject).on('ready', () => client.exec(command, (error, stream) => {
          if (error) { client.end(); reject(error); return; }
          let output = ''; stream.on('data', data => { output += data; });
          stream.on('close', code => { client.end(); code === 0 ? resolve(output.trim()) : reject(new Error('Guest command failed')); });
        })).connect({ host, port, username: 'root', password, readyTimeout: 5000 });
      });
    } catch (error) { if (attempt === 14) throw error; await sleep(1000); }
  }
}
const overview = async () => (await api('admin/overview')).value;
function assertTestResource(resource) {
  assert(/^a9900000[12]$/.test(resource.studentId) && resource.vmid >= 990000 && resource.vmid <= 990009, 'Refuse to modify a non-test resource');
}

if (!state.adminCookie) { state.adminCookie = (await api('auth/admin', { code: generateSync({ secret: fixture.adminSecret }) }, '')).cookie; save(); }
await api('auth/session');
const settings = (await api('admin/settings')).value;
assert(settings.title === 'PVE Upgrade Verification' && settings.vmidStart === 990000 && settings.vmidEnd === 990009, 'Not the isolated upgrade instance');
const phase = process.argv[2] || 'verify';

if (phase === 'api') {
  state.nextApiPassword ||= randomBytes(24).toString('base64url'); save();
  const target = 'http://127.0.0.1:18881/manage';
  await waitTask((await api('admin/gost/api', { gostApi: target, gostUser: 'upgrade-new', gostPassword: state.nextApiPassword })).value.taskId);
  assert((await api('admin/settings')).value.gostApi === target, 'API candidate was not committed');
  const jobId = (await api('admin/gost/api', { gostApi: 'http://127.0.0.1:18882', gostUser: 'upgrade-failure', gostPassword: 'temporary-failure-password' })).value.taskId;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if ((await api('admin/tasks/' + jobId)).value.step === 'api-apply') break; await sleep(100); }
  assert((await api('admin/tasks/' + jobId)).value.step === 'api-apply', 'Missed rollback fault injection checkpoint');
  const blocker = createServer((_request, response) => { response.writeHead(503, { Connection: 'close' }); response.end(); });
  await new Promise((resolve, reject) => { blocker.once('error', reject); blocker.listen(18882, '127.0.0.1', resolve); });
  try { assert((await waitTask(jobId, true)).state === 'failed', 'Expected a recovered API failure'); }
  finally { await new Promise(resolve => { blocker.close(resolve); blocker.closeAllConnections(); }); }
  assert((await api('admin/settings')).value.gostApi === target, 'Rollback did not restore active settings');
  state.apiVerified = true; save();
  log('real-gost-api-sync-and-rollback-verified');
}

if (phase === 'verify') {
  const [bridges, stores, templates, host, history] = await Promise.all(['options/networks', 'options/storages', 'options/templates', 'host/status', 'host/history'].map(path => api('admin/' + path).then(result => result.value)));
  assert(bridges.length && stores.some(store => store.content.includes('rootdir')), 'PVE options unavailable');
  assert(host.data?.cpus > 0 && !host.error && Array.isArray(history.data), 'Host metrics unavailable');
  log('pve-options-and-host-metrics', { cpus: host.data.cpus, storages: host.data.storages.length, history: history.data.length });
  const storage = stores.find(store => store.content.includes('rootdir')).storage;
  const debian = templates.find(template => template.distro === 'debian');
  const ubuntu = templates.find(template => template.distro === 'ubuntu');
  assert(debian && ubuntu, 'Both supported templates are required');
  let current = await overview();
  let network = current.networks.find(network => network.name === 'UPGRADE NAT');
  if (!network) network = (await api('admin/networks', { name: 'UPGRADE NAT', mode: 'nat', cidr: '172.31.249.0/24', gateway: '172.31.249.1', start: '172.31.249.10', end: '172.31.249.20', dns: ['223.5.5.5'] })).value;
  state.networkId = network.id; state.natBridge = network.bridge; save();
  assert(/^dc[0-9a-f]{6}$/.test(network.bridge), 'NAT name was not generated');
  if (!network.ready) await waitTask((await api('admin/networks/' + network.id + '/apply', {})).value.taskId);
  current = await overview();
  let profile = current.profiles.find(profile => profile.name === 'UPGRADE DEBIAN');
  if (!profile) profile = (await api('admin/profiles', { name: 'UPGRADE DEBIAN', enabled: true, published: true, template: debian.volid, distro: 'debian', storage, cores: 1, memory: 512, disk: 4, networkId: network.id })).value;
  state.profileId = profile.id; save();
  await api('admin/settings', { defaultProfileId: profile.id, registrationOpen: true, selfSelection: true });
  state.password ||= randomBytes(24).toString('base64url'); save();
  await api('admin/students', { id: 'a99000001', name: 'UPGRADE DEBIAN', className: 'ISOLATED TEST' });
  current = await overview();
  if (!current.resources.some(resource => resource.studentId === 'a99000001')) {
    const claim = await api('public/claim', { studentId: 'a99000001', password: state.password }, '');
    state.studentCookie = claim.cookie; save(); await waitTask(claim.value.taskId);
  } else state.studentCookie = (await api('auth/student', { studentId: 'a99000001', password: state.password }, '')).cookie;
  const first = (await api('me/overview', undefined, state.studentCookie)).value.resource;
  assertTestResource(first); state.first = first; save();
  assert(await ssh('hostname', first.ip, state.password) === first.studentId, 'Debian hostname/password mismatch');
  const listeners = (await api('me/ports', undefined, state.studentCookie)).value.data;
  assert(listeners.some(port => port.port === 22 && port.processes.some(process => process.name && process.pid > 0)), 'Structured ports unavailable');
  assert(listeners.every(port => !port.address.includes('%') && !Object.hasOwn(port, 'process')), 'Raw ss output leaked');
  log('debian-nat-verified', { vmid: first.vmid, ip: first.ip });
  current = await overview();
  let bridge = current.networks.find(network => network.name === 'UPGRADE BRIDGE');
  if (!bridge) bridge = (await api('admin/networks', { name: 'UPGRADE BRIDGE', mode: 'bridge', bridge: state.natBridge, cidr: '172.31.249.0/24', gateway: '172.31.249.1', start: '172.31.249.30', end: '172.31.249.40', dns: ['223.5.5.5'] })).value;
  state.bridgeId = bridge.id; save();
  if (!bridge.ready) await waitTask((await api('admin/networks/' + bridge.id + '/apply', {})).value.taskId);
  let secondProfile = current.profiles.find(profile => profile.name === 'UPGRADE UBUNTU');
  if (!secondProfile) secondProfile = (await api('admin/profiles', { name: 'UPGRADE UBUNTU', enabled: true, published: false, template: ubuntu.volid, distro: 'ubuntu', storage, cores: 1, memory: 512, disk: 4, nesting: true, networkId: bridge.id })).value;
  state.secondProfileId = secondProfile.id; state.secondPassword ||= randomBytes(24).toString('base64url'); save();
  await api('admin/students', { id: 'a99000002', name: 'UPGRADE UBUNTU', className: 'ISOLATED TEST', profileId: secondProfile.id });
  current = await overview();
  if (!current.resources.some(resource => resource.studentId === 'a99000002')) {
    const claim = await api('public/claim', { studentId: 'a99000002', password: state.secondPassword, profileId: profile.id }, '');
    state.secondCookie = claim.cookie; save(); await waitTask(claim.value.taskId);
  } else state.secondCookie = (await api('auth/student', { studentId: 'a99000002', password: state.secondPassword }, '')).cookie;
  const second = (await api('me/overview', undefined, state.secondCookie)).value.resource;
  assertTestResource(second); state.second = second; save();
  assert(second.profileId === secondProfile.id && second.spec.distro === 'ubuntu', 'Assigned profile did not override submitted profile');
  assert(await ssh('hostname', second.ip, state.secondPassword) === second.studentId, 'Ubuntu hostname/password mismatch');
  log('ubuntu-existing-vnet-verified', { vmid: second.vmid, ip: second.ip });
  await waitTask((await api('admin/gost/apply', {})).value.taskId);
  if (!(await api('me/overview', undefined, state.studentCookie)).value.forwards.some(rule => rule.protocol === 'tcp')) await waitTask((await api('me/forwards', { protocol: 'tcp', targetPort: 22, publicPort: 11009, note: 'UPGRADE SSH' }, state.studentCookie)).value.taskId);
  assert(await ssh('hostname', fixture.relayHost, state.password, 11009) === first.studentId, 'Public TCP forwarding failed');
  const script = 'import socket\ns=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)\ns.bind(("0.0.0.0",9000))\nwhile True:\n d,a=s.recvfrom(2048)\n s.sendto(d,a)';
  spawnSync('pct', ['exec', String(first.vmid), '--', 'systemctl', 'stop', 'pvedc-upgrade-udp'], { stdio: 'ignore' });
  execFileSync('pct', ['exec', String(first.vmid), '--', 'systemd-run', '--collect', '--unit=pvedc-upgrade-udp', '/usr/bin/python3', '-u', '-c', script], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (!(await api('me/overview', undefined, state.studentCookie)).value.forwards.some(rule => rule.protocol === 'udp')) await waitTask((await api('me/forwards', { protocol: 'udp', targetPort: 9000, publicPort: 11008, note: 'UPGRADE UDP' }, state.studentCookie)).value.taskId);
  const udp = createSocket('udp4'), nonce = randomBytes(16).toString('hex');
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { clearInterval(interval); udp.close(); reject(new Error('Public UDP timed out')); }, 15000);
    const interval = setInterval(() => udp.send(nonce, 11008, fixture.relayHost), 1000);
    udp.once('message', message => { clearTimeout(timeout); clearInterval(interval); udp.close(); message.toString() === nonce ? resolve() : reject(new Error('UDP response mismatch')); });
    udp.once('error', error => { clearTimeout(timeout); clearInterval(interval); udp.close(); reject(error); });
  });
  log('public-tcp-and-udp-verified', { tcp: 11009, udp: 11008, web: 11010 });
  const fresh = await api('auth/refresh', {}, state.studentCookie); state.studentCookie = fresh.cookie; save();
  assert((await api('auth/session', undefined, state.studentCookie)).value.actor.sub === first.studentId, 'Student refresh failed');
  state.verified = true; save();
}

if (phase === 'cleanup') {
  const current = await overview();
  for (const resource of current.resources) assertTestResource(resource);
  for (const student of current.students) assert(/^a9900000[123]$/.test(student.id), 'Refuse to delete a non-test student');
  if (current.resources.length === 2) {
    for (const action of ['shutdown', 'start', 'reboot']) { await batch(current.resources.map(resource => resource.studentId), action); log('batch-' + action + '-verified'); }
    await batch(['a99000001'], 'reclaim');
    assert((await overview()).students.some(student => student.id === 'a99000001'), 'Reclaim unexpectedly deleted the student');
    log('batch-reclaim-verified');
  }
  await api('admin/students', { id: 'a99000003', name: 'UPGRADE EMPTY', className: 'ISOLATED TEST' });
  const ids = (await overview()).students.map(student => student.id);
  const deletion = await batch([...ids, 'a99999999'], 'delete');
  assert(deletion.items.find(item => item.studentId === 'a99999999').status === 'failed', 'Partial batch failure not reported');
  const after = await overview();
  assert(after.students.length === 0 && after.resources.length === 0 && after.forwards.length === 0, 'Guest cleanup incomplete');
  await api('admin/settings', { registrationOpen: false, defaultProfileId: null });
  for (const profile of after.profiles) { assert(profile.name.startsWith('UPGRADE ')); await api('admin/profiles/' + profile.id, {}, state.adminCookie, 'DELETE'); }
  for (const network of after.networks.sort((a, b) => a.mode === 'bridge' ? -1 : b.mode === 'bridge' ? 1 : 0)) {
    assert(network.name.startsWith('UPGRADE '));
    if (network.ready) await waitTask((await api('admin/networks/' + network.id + '/remove', {})).value.taskId);
    await api('admin/networks/' + network.id, {}, state.adminCookie, 'DELETE');
  }
  assert((await overview()).networks.length === 0, 'Network cleanup incomplete');
  state.cleaned = true; save(); log('batch-delete-and-cleanup-verified');
}

if (phase === 'status') log('status', { verified: state.verified, cleaned: state.cleaned, students: (await overview()).students.length, resources: (await overview()).resources.length });
if (phase === 'retry') { assert(process.argv[3], 'Task ID required'); await api('admin/tasks/' + process.argv[3] + '/retry', {}); await waitTask(process.argv[3], true); }
