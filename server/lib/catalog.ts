import { randomUUID } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { networkSchema, profileSchema, studentSchema, type NetworkSpec, type Settings, type StudentInput } from '../../shared/schema';
import { audit, getDb, now } from './db';
import { ensure } from './errors';
import { saveStudentKey } from './claim-key';
import { availableIps, ipNumber, validateNetwork } from './allocation';
import { adminStudents, networks, profiles, resources, students, studentDeleting } from './records';
import { revokeSubject } from './sessions';
import { getSettings } from './settings';

const networkHasTask = (id: string) => !!getDb().prepare("SELECT id FROM jobs WHERE type IN ('network-apply','network-remove') AND state IN ('queued','running','attention') AND json_extract(payload,'$.networkId')=?").get(id);

export function validateSettings(settings: Settings) {
  const all = profiles();
  if (settings.defaultProfileId) ensure(all.some(p => p.id === settings.defaultProfileId && p.enabled && p.published), 400, '默认配置必须有效且已发布');
  if (settings.registrationOpen) {
    const profile = all.find(p => p.id === settings.defaultProfileId);
    ensure(profile && profile.networkIds.every(id => networks().some(n => n.id === id && n.ready)), 400, '请先设置有效默认配置并应用全部网络');
  }
  const leases = getDb().prepare('SELECT public_port FROM forwards').all() as { public_port: number }[];
  ensure(leases.every(r => r.public_port >= settings.portStart && r.public_port <= settings.portEnd && !settings.reservedPorts.includes(r.public_port) && r.public_port !== settings.webTunnelPort), 409, '端口范围或保留端口与现有转发冲突');
}
export function saveStudents(inputs: StudentInput[]) {
  const ids = new Set<string>();
  const all = profiles();
  for (const item of inputs) {
    ensure(!studentDeleting(item.id), 409, '学生正在删除，请先处理删除任务');
    ensure(!ids.has(item.id), 400, '名单中存在重复学号：' + item.id); ids.add(item.id);
    ensure(!item.profileId || all.some(p => p.id === item.profileId && p.enabled), 400, '指定配置不存在或已停用');
  }
  getDb().transaction(() => {
    const query = getDb().prepare('INSERT INTO students(id,name,class_name,profile_id,enabled,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,class_name=excluded.class_name,profile_id=excluded.profile_id,enabled=excluded.enabled');
    for (const item of inputs) {
      query.run(item.id, item.name, item.className, item.profileId, Number(item.enabled), now());
      if (item.claimKey !== undefined) saveStudentKey(item.id, item.claimKey);
      if (!item.enabled) revokeSubject(item.id);
    }
    audit('admin', 'students.save', undefined, String(inputs.length));
  }).immediate();
  return { count: inputs.length };
}
export function importStudents(csv: string) {
  let rows: Record<string, string>[];
  try { rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true, trim: true, delimiter: csv.split('\n')[0].includes('\t') ? '\t' : ',', max_record_size: 4096 }); }
  catch { ensure(false, 400, '名单格式不正确，需要学号、姓名、班级表头'); }
  ensure(rows.length <= 5000, 400, '单次最多导入 5000 人');
  const existing = new Map(students().map(student => [student.id, student]));
  const entries = rows.map(row => {
    const id = row['学号'] ?? row.id, previous = existing.get(id);
    const explicitProfile = Object.hasOwn(row, '配置ID') || Object.hasOwn(row, 'profileId');
    const explicitKey = Object.hasOwn(row, '认领密钥') || Object.hasOwn(row, 'claimKey');
    return studentSchema.parse({ id, name: row['姓名'] ?? row.name, className: row['班级'] ?? row.className ?? previous?.className ?? '',
      profileId: explicitProfile ? row['配置ID'] || row.profileId || null : previous?.profileId || null, enabled: previous?.enabled ?? true,
      claimKey: explicitKey ? row['认领密钥'] || row.claimKey || '' : undefined });
  });
  return saveStudents(entries);
}
export function exportStudents() {
  // Prefix formula-looking text so spreadsheet programs cannot execute roster cells.
  const safe = (text: string) => /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
  return '\uFEFF' + stringify(adminStudents().map(s => ({ '学号': s.id, '姓名': safe(s.name), '班级': safe(s.className), '配置ID': s.profileId || '', '认领密钥': s.claimKey, '认领状态': s.claimed ? '已认领' : '未认领', 'VMID': s.resource?.vmid || '', 'IP': s.resource?.networks[0].ip || '' })), { header: true });
}
export function saveProfile(input: unknown, id: string = randomUUID()) {
  const spec = profileSchema.parse(input);
  const all = networks();
  for (const networkId of spec.networkIds) ensure(all.some(n => n.id === networkId), 400, '网络配置不存在');
  ensure(spec.template.split('/').pop()?.startsWith(spec.distro + '-'), 400, '模板发行版与配置不一致');
  const settings = getSettings();
  if (id === settings.defaultProfileId) ensure(spec.enabled && spec.published, 409, '默认配置不能停用或取消发布，请先更换默认配置');
  getDb().prepare('INSERT INTO profiles(id,spec) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET spec=excluded.spec').run(id, JSON.stringify(spec));
  audit('admin', 'profile.save', id);
  return { ...spec, id };
}
export function saveNetwork(input: unknown, id: string = randomUUID()) {
  const spec = networkSchema.parse(input);
  validateNetwork(spec);
  const existing = networks().find(n => n.id === id);
  const topologyKeys = ['mode', 'bridge', 'cidr', 'gateway', 'vlan'] as const;
  const changingTopology = existing && topologyKeys.some(key => existing[key] !== spec[key]);
  ensure(!networkHasTask(id), 409, '网络有进行中或待处理任务，请先完成该任务');
  ensure(!changingTopology || !existing?.ready, 409, '已应用网络请先撤销，再修改网络拓扑');
  const inUse = resources().filter(r => r.networks.some(entry => entry.networkId === id));
  if (inUse.length && existing) {
    ensure(!changingTopology, 409, '网络有在用资源，不能修改拓扑、网关或 VLAN');
    const ips = new Set(availableIps(spec));
    ensure(inUse.every(r => r.networks.filter(entry => entry.networkId === id).every(entry => ips.has(entry.ip))), 409, '新的范围排除了已分配 IP');
  }
  for (const network of networks().filter(n => n.id !== id)) {
    ensure(ipNumber(spec.end) < ipNumber(network.start) || ipNumber(spec.start) > ipNumber(network.end), 409, '地址池与其他网络重叠');
    ensure(spec.mode !== 'nat' || network.bridge !== spec.bridge, 409, 'NAT 网桥名称已经使用');
  }
  const topologyUnchanged = existing && ['mode', 'bridge', 'cidr', 'gateway', 'vlan'].every(key => existing[key as keyof NetworkSpec] === spec[key as keyof NetworkSpec]);
  getDb().prepare('INSERT INTO networks(id,spec,ready,error) VALUES(?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET spec=excluded.spec,ready=excluded.ready,error=NULL').run(id, JSON.stringify(spec), topologyUnchanged && existing?.ready ? 1 : 0);
  audit('admin', 'network.save', id);
  return { ...spec, id };
}
export function removeCatalog(kind: 'students' | 'profiles' | 'networks', id: string) {
  if (kind === 'profiles') ensure(getSettings().defaultProfileId !== id, 409, '不能删除默认配置');
  if (kind === 'students') {
    ensure(!resources().some(r => r.studentId === id), 409, '请先回收学生资源');
    revokeSubject(id);
    const student = getDb().prepare('SELECT name,class_name FROM students WHERE id=?').get(id) as { name: string; class_name: string } | undefined;
    getDb().prepare("UPDATE jobs SET payload=json_set(payload,'$.studentId',?,'$.studentName',?,'$.studentClassName',?),student_id=NULL WHERE student_id=?")
      .run(id, student?.name || '', student?.class_name || '', id);
    audit('admin', 'student.deleted-identity', id, JSON.stringify(student || {}));
  }
  if (kind === 'networks') {
    ensure(!networkHasTask(id), 409, '网络任务尚未完成，请先处理该任务');
    ensure(!networks().find(n => n.id === id)?.ready, 409, '已应用网络不能直接删除，请先撤销网络');
    ensure(!profiles().some(profile => profile.networkIds.includes(id)), 409, '资源配置仍引用此网络');
    ensure(!resources().some(resource => resource.networks.some(entry => entry.networkId === id)), 409, '仍有机器使用此网络');
  }
  const queries = { students: 'DELETE FROM students WHERE id=?', profiles: 'DELETE FROM profiles WHERE id=?', networks: 'DELETE FROM networks WHERE id=?' };
  getDb().prepare(queries[kind]).run(id);
  audit('admin', kind + '.delete', id);
}
export function resetClaim(id: string) {
  ensure(!studentDeleting(id), 409, '学生正在删除，请先处理删除任务');
  ensure(!resources().some(r => r.studentId === id), 409, '请先回收已有资源');
  revokeSubject(id);
  getDb().prepare('UPDATE students SET password_hash=NULL WHERE id=?').run(id);
  audit('admin', 'student.reset-claim', id);
}
