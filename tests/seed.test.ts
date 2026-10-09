import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { initializeSeed } from '../server/lib/seed';
import { getDb, closeDb, meta } from '../server/lib/db';
import { getSettings, saveSettings } from '../server/lib/settings';
import { networks, profiles, students } from '../server/lib/records';

const directory = mkdtempSync(resolve(tmpdir(), 'pvedc-seed-test-'));
const config = {
  settings: { defaultProfileId: 'small', title: 'Initial title' },
  networks: [{ id: 'private', name: 'Private', mode: 'nat', bridge: 'dctest', cidr: '172.30.0.0/24', gateway: '172.30.0.1', start: '172.30.0.10', end: '172.30.0.20', dns: ['1.1.1.1'] }],
  profiles: [{ id: 'small', name: 'Small', published: true, enabled: true, template: 'local:vztmpl/debian-13-test.tar.zst', distro: 'debian', storage: 'local-lvm', cores: 1, memory: 512, disk: 4, networkId: 'private' }],
  students: [{ id: 'a00123456', name: 'Seed student', profileId: 'small' }],
};
beforeAll(() => { process.env.PDC_DATA_DIR = directory; });
afterAll(() => {
  closeDb(); delete process.env.PDC_DATA_DIR; delete process.env.PDC_INITIAL_CONFIG;
  if (!directory.startsWith(resolve(tmpdir(), 'pvedc-seed-test-'))) throw new Error('Unsafe test cleanup path');
  rmSync(directory, { recursive: true, force: true });
});
it('rolls back an invalid initial configuration', () => {
  process.env.PDC_INITIAL_CONFIG = JSON.stringify({ ...config, profiles: [{ ...config.profiles[0], networkId: 'missing' }] });
  expect(() => initializeSeed()).toThrow('网络配置不存在');
  expect(networks()).toHaveLength(0); expect(profiles()).toHaveLength(0);
  expect(meta('initial_config_imported')).toBeUndefined();
});
it('imports all definitions once without modifying host networking', () => {
  process.env.PDC_INITIAL_CONFIG = JSON.stringify(config); initializeSeed();
  expect(networks()[0].ready).toBe(false);
  expect(profiles()[0].id).toBe('small'); expect(students()[0].id).toBe('a00123456');
  expect(getSettings().defaultProfileId).toBe('small');
  expect((getDb().prepare('SELECT count(*) count FROM jobs').get() as { count: number }).count).toBe(0);
  saveSettings({ ...getSettings(), title: 'Changed in Web' });
  process.env.PDC_INITIAL_CONFIG = JSON.stringify({ ...config, settings: { title: 'Must not replace Web settings' } });
  initializeSeed(); expect(getSettings().title).toBe('Changed in Web');
});
