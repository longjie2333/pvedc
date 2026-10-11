import { createHash, timingSafeEqual } from 'node:crypto';
import { getDb } from './db';
import { seal, unseal } from './crypto';

export function studentKeys(): Map<string, string> {
  const rows = getDb().prepare('SELECT student_id,sealed FROM student_keys').all() as { student_id: string; sealed: string }[];
  return new Map(rows.map(row => [row.student_id, unseal(row.sealed)]));
}
export function studentKey(id: string): string {
  const row = getDb().prepare('SELECT sealed FROM student_keys WHERE student_id=?').get(id) as { sealed: string } | undefined;
  return row ? unseal(row.sealed) : '';
}
export function saveStudentKey(id: string, value: string) {
  if (!value) { getDb().prepare('DELETE FROM student_keys WHERE student_id=?').run(id); return; }
  getDb().prepare('INSERT INTO student_keys(student_id,sealed) VALUES(?,?) ON CONFLICT(student_id) DO UPDATE SET sealed=excluded.sealed').run(id, seal(value));
}
export function matchesClaimKey(stored: string, provided: string) {
  const expected = createHash('sha256').update(stored, 'utf8').digest();
  const actual = createHash('sha256').update(provided, 'utf8').digest();
  return timingSafeEqual(expected, actual);
}
