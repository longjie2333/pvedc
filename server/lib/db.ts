import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const dataDir = () => resolve(process.env.PDC_DATA_DIR || '.data');

export function openDatabase(path: string) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec([
    'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS networks (id TEXT PRIMARY KEY, spec TEXT NOT NULL, ready INTEGER NOT NULL DEFAULT 0, error TEXT);',
    'CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, spec TEXT NOT NULL, network_id TEXT NOT NULL REFERENCES networks(id));',
    'CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, name TEXT NOT NULL, class_name TEXT NOT NULL DEFAULT \'\', profile_id TEXT REFERENCES profiles(id), enabled INTEGER NOT NULL DEFAULT 1, password_hash TEXT, created_at INTEGER NOT NULL);',
    'CREATE TABLE IF NOT EXISTS student_keys (student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE, sealed TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, student_id TEXT NOT NULL UNIQUE REFERENCES students(id), vmid INTEGER NOT NULL UNIQUE, profile_id TEXT NOT NULL REFERENCES profiles(id), network_id TEXT NOT NULL REFERENCES networks(id), ip TEXT NOT NULL UNIQUE, spec TEXT NOT NULL, network TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL);',
    'CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, type TEXT NOT NULL, student_id TEXT REFERENCES students(id), resource_id TEXT, state TEXT NOT NULL, step TEXT NOT NULL DEFAULT \'pending\', payload TEXT NOT NULL, secret TEXT, upid TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);',
    'CREATE UNIQUE INDEX IF NOT EXISTS jobs_resource_active ON jobs(resource_id) WHERE resource_id IS NOT NULL AND state IN (\'queued\',\'running\',\'attention\');',
    'CREATE TABLE IF NOT EXISTS forwards (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), resource_id TEXT NOT NULL REFERENCES resources(id), protocol TEXT NOT NULL, public_port INTEGER NOT NULL, target_port INTEGER NOT NULL, note TEXT NOT NULL DEFAULT \'\', enabled INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL, error TEXT, UNIQUE(protocol, public_port));',
    'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, role TEXT NOT NULL, subject TEXT NOT NULL, expires_at INTEGER NOT NULL);',
    'CREATE TABLE IF NOT EXISTS refresh_sessions (session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE, current_id TEXT NOT NULL, previous_id TEXT, issued_at INTEGER NOT NULL, previous_valid_until INTEGER NOT NULL);',
    'CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);',
    'CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT, created_at INTEGER NOT NULL);',
    'CREATE TABLE IF NOT EXISTS guides (id TEXT PRIMARY KEY, title TEXT NOT NULL, markdown TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, default_collapsed INTEGER NOT NULL DEFAULT 1, published INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);',
    'CREATE INDEX IF NOT EXISTS jobs_state ON jobs(state, created_at);',
    "CREATE UNIQUE INDEX IF NOT EXISTS jobs_gost_api_active ON jobs(type) WHERE type='gost-api-update' AND state IN ('queued','running','attention');",
    "CREATE UNIQUE INDEX IF NOT EXISTS jobs_student_delete_active ON jobs(student_id) WHERE type='student-delete' AND state IN ('queued','running','attention');",
    "CREATE INDEX IF NOT EXISTS jobs_batch ON jobs(json_extract(payload,'$.batchId'));",
    'CREATE INDEX IF NOT EXISTS jobs_created ON jobs(created_at DESC,id DESC);',
    'CREATE INDEX IF NOT EXISTS jobs_student_created ON jobs(student_id,created_at DESC,id DESC);',
    'CREATE INDEX IF NOT EXISTS audit_created ON audit(created_at DESC,id DESC);',
    'CREATE INDEX IF NOT EXISTS audit_actor_created ON audit(actor,created_at DESC);',
    'CREATE INDEX IF NOT EXISTS audit_action_created ON audit(action,created_at DESC);',
    'CREATE INDEX IF NOT EXISTS guides_order ON guides(sort_order,updated_at DESC,id);',
  ].join('\n'));
  const version = db.prepare('SELECT value FROM meta WHERE key=?').get('schema_version') as { value: string } | undefined;
  if (version && version.value !== '1') { db.close(); throw new Error('不支持此数据库版本，请使用匹配的应用版本'); }
  db.prepare('INSERT OR IGNORE INTO meta(key,value) VALUES (?,?)').run('schema_version', '1');
  db.prepare('INSERT OR IGNORE INTO meta(key,value) VALUES (?,?)').run('instance_id', process.env.PDC_INSTANCE_ID || randomUUID());
  return db;
}

let database: Database.Database | undefined;
export function getDb() {
  if (!database) { mkdirSync(dataDir(), { recursive: true, mode: 0o700 }); database = openDatabase(resolve(dataDir(), 'pvedc.sqlite')); }
  return database;
}
export function closeDb() { database?.close(); database = undefined; }
export const now = () => Math.floor(Date.now() / 1000);
export function meta(key: string) { return (getDb().prepare('SELECT value FROM meta WHERE key=?').get(key) as { value: string } | undefined)?.value; }
export function setMeta(key: string, value: string) { getDb().prepare('INSERT INTO meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); }
export function audit(actor: string, action: string, target?: string, detail?: string) {
  getDb().prepare('INSERT INTO audit(actor,action,target,detail,created_at) VALUES (?,?,?,?,?)').run(actor, action, target ?? null, detail ?? null, now());
}
