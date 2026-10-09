import type { Actor, Forward, Network, Profile, Resource, Student, Task } from '../../shared/schema';
import { getDb } from './db';
import { ensure } from './errors';

export interface StudentRow { id: string; name: string; class_name: string; profile_id: string | null; enabled: number; password_hash: string | null; created_at: number }
interface ResourceRow { id: string; student_id: string; vmid: number; profile_id: string; network_id: string; ip: string; spec: string; network: string; state: Resource['state']; created_at: number }
interface JobRow { id: string; type: string; student_id: string | null; resource_id: string | null; state: Task['state']; step: string; error: string | null; created_at: number; updated_at: number }
export interface FullJobRow extends JobRow { payload: string; secret: string | null; upid: string | null }

export function profiles(): Profile[] {
  return (getDb().prepare('SELECT id,spec FROM profiles').all() as { id: string; spec: string }[]).map(r => ({ ...JSON.parse(r.spec), id: r.id }));
}
export function networks(): Network[] {
  return (getDb().prepare('SELECT * FROM networks').all() as { id: string; spec: string; ready: number; error: string | null }[]).map(r => ({ ...JSON.parse(r.spec), id: r.id, ready: !!r.ready, error: r.error }));
}
export function resources(): Resource[] {
  return (getDb().prepare('SELECT * FROM resources').all() as ResourceRow[]).map(r => ({ id: r.id, studentId: r.student_id, vmid: r.vmid, profileId: r.profile_id, networkId: r.network_id, ip: r.ip, spec: JSON.parse(r.spec), network: JSON.parse(r.network), state: r.state, createdAt: r.created_at }));
}
export function students(): Student[] {
  const machines = resources();
  return (getDb().prepare('SELECT * FROM students ORDER BY id').all() as StudentRow[]).map(r => ({
    id: r.id, name: r.name, className: r.class_name, profileId: r.profile_id, enabled: !!r.enabled,
    claimed: !!r.password_hash, createdAt: r.created_at, resource: machines.find(m => m.studentId === r.id) || null,
  }));
}
export function taskView(r: JobRow): Task {
  return { id: r.id, type: r.type, studentId: r.student_id, resourceId: r.resource_id, state: r.state, step: r.step, error: r.error, createdAt: r.created_at, updatedAt: r.updated_at };
}
export function taskForActor(id: string, actor: Actor): Task {
  const row = getDb().prepare('SELECT * FROM jobs WHERE id=?').get(id) as JobRow | undefined;
  ensure(row && (actor.role === 'admin' || row.student_id === actor.sub), 404, '任务不存在');
  return taskView(row);
}
export function forwards(studentId?: string): Forward[] {
  const rows = (studentId ? getDb().prepare('SELECT * FROM forwards WHERE student_id=?').all(studentId) : getDb().prepare('SELECT * FROM forwards').all()) as { id: string; student_id: string; resource_id: string; protocol: 'tcp' | 'udp'; target_port: number; public_port: number; note: string; enabled: number; state: string; error: string | null }[];
  return rows.map(r => ({ id: r.id, studentId: r.student_id, resourceId: r.resource_id, protocol: r.protocol, targetPort: r.target_port, publicPort: r.public_port, note: r.note, enabled: !!r.enabled, state: r.state, error: r.error }));
}
