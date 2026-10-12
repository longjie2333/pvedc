import { afterAll, beforeAll, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { openDatabase } from '../server/lib/db';

const directory = mkdtempSync(resolve(tmpdir(), 'pvedc-upgrade-test-'));
const legacyFile = resolve(directory, 'legacy.sqlite');
const networkSpec = { name: 'Legacy pool', mode: 'nat', bridge: 'dclegacy', cidr: '172.30.0.0/24', gateway: '172.30.0.1', start: '172.30.0.10', end: '172.30.0.200', dns: ['1.1.1.1'], excluded: [], vlan: null };
const profileSpec = { name: 'Legacy small', published: true, enabled: true, template: 'local:vztmpl/debian-13-test.tar.zst', distro: 'debian', storage: 'local-lvm', cores: 2, memory: 1024, swap: 0, disk: 8, networkId: 'legacy-net', nesting: false, initialForwards: [] };

beforeAll(() => {
  const legacy = new Database(legacyFile);
  legacy.exec([
    'CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
    'CREATE TABLE networks (id TEXT PRIMARY KEY, spec TEXT NOT NULL, ready INTEGER NOT NULL DEFAULT 0, error TEXT);',
    'CREATE TABLE profiles (id TEXT PRIMARY KEY, spec TEXT NOT NULL, network_id TEXT NOT NULL REFERENCES networks(id));',
    "CREATE TABLE students (id TEXT PRIMARY KEY, name TEXT NOT NULL, class_name TEXT NOT NULL DEFAULT '', profile_id TEXT REFERENCES profiles(id), enabled INTEGER NOT NULL DEFAULT 1, password_hash TEXT, created_at INTEGER NOT NULL);",
    'CREATE TABLE resources (id TEXT PRIMARY KEY, student_id TEXT NOT NULL UNIQUE REFERENCES students(id), vmid INTEGER NOT NULL UNIQUE, profile_id TEXT NOT NULL REFERENCES profiles(id), network_id TEXT NOT NULL REFERENCES networks(id), ip TEXT NOT NULL UNIQUE, spec TEXT NOT NULL, network TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL);',
    'CREATE TABLE forwards (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), resource_id TEXT NOT NULL REFERENCES resources(id), protocol TEXT NOT NULL, public_port INTEGER NOT NULL, target_port INTEGER NOT NULL, note TEXT NOT NULL DEFAULT \'\', enabled INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL, error TEXT, UNIQUE(protocol, public_port));',
  ].join('\n'));
  legacy.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('schema_version', '1');
  legacy.prepare('INSERT INTO networks(id,spec,ready) VALUES(?,?,1)').run('legacy-net', JSON.stringify(networkSpec));
  legacy.prepare('INSERT INTO profiles(id,spec,network_id) VALUES(?,?,?)').run('legacy-profile', JSON.stringify(profileSpec), 'legacy-net');
  legacy.prepare('INSERT INTO students(id,name,created_at) VALUES(?,?,?)').run('s0001', 'Legacy student', 1);
  legacy.prepare('INSERT INTO resources(id,student_id,vmid,profile_id,network_id,ip,spec,network,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run('legacy-resource', 's0001', 1001, 'legacy-profile', 'legacy-net', '172.30.0.10', JSON.stringify(profileSpec), JSON.stringify(networkSpec), 'ready', 1);
  legacy.prepare('INSERT INTO forwards(id,student_id,resource_id,protocol,public_port,target_port,note,state) VALUES(?,?,?,?,?,?,?,?)')
    .run('legacy-forward', 's0001', 'legacy-resource', 'tcp', 22001, 22, '', 'ready');
  legacy.close();
});

afterAll(() => {
  if (!directory.startsWith(resolve(tmpdir(), 'pvedc-upgrade-test-'))) throw new Error('Unsafe cleanup');
  rmSync(directory, { recursive: true, force: true });
});

it('rewrites a v1 database into the multi-network shape without losing data', () => {
  const db = openDatabase(legacyFile);
  expect((db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as { value: string }).value).toBe('2');
  const profile = db.prepare('SELECT spec FROM profiles WHERE id=?').get('legacy-profile') as { spec: string };
  const profileValue = JSON.parse(profile.spec) as Record<string, unknown>;
  expect(profileValue.networkIds).toEqual(['legacy-net']);
  expect(profileValue).not.toHaveProperty('networkId');
  const resource = db.prepare('SELECT networks,spec FROM resources WHERE id=?').get('legacy-resource') as { networks: string; spec: string };
  const networks = JSON.parse(resource.networks) as Record<string, unknown>[];
  expect(networks).toEqual([{
    iface: 'eth0', networkId: 'legacy-net', name: networkSpec.name, bridge: networkSpec.bridge, cidr: networkSpec.cidr,
    ip: '172.30.0.10', gateway: networkSpec.gateway, dns: networkSpec.dns, vlan: null, mac: null,
  }]);
  expect((JSON.parse(resource.spec) as Record<string, unknown>).networkIds).toEqual(['legacy-net']);
  const forward = db.prepare('SELECT target_port FROM forwards WHERE id=?').get('legacy-forward') as { target_port: number };
  expect(forward.target_port).toBe(22);
  const violations = db.pragma('foreign_key_check') as unknown[];
  expect(violations).toEqual([]);
  db.close();
});

it('opens the upgraded database again without repeating the rewrite', () => {
  const db = openDatabase(legacyFile);
  expect((db.prepare('SELECT count(*) count FROM resources').get() as { count: number }).count).toBe(1);
  expect((db.prepare('SELECT count(*) count FROM profiles').get() as { count: number }).count).toBe(1);
  expect((db.prepare('SELECT count(*) count FROM forwards').get() as { count: number }).count).toBe(1);
  db.close();
});
