import { getDb, now, audit } from './db';
import type { FullJobRow } from './records';

export function checkpoint(job: FullJobRow, step: string, upid: string | null = null) {
  getDb().prepare('UPDATE jobs SET step=?,upid=?,updated_at=? WHERE id=?').run(step, upid, now(), job.id);
  job.step = step; job.upid = upid;
}

export function succeed(job: FullJobRow) {
  getDb().prepare("UPDATE jobs SET state=?,step=?,secret=NULL,error=NULL,payload=json_remove(payload,'$.sdnLock'),updated_at=? WHERE id=?").run('succeeded', 'complete', now(), job.id);
  audit('system', 'task.complete', job.id);
}
