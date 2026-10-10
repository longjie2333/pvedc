import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
const mock = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mock.spawn }));
vi.mock('../server/lib/db', () => ({ meta: () => 'test-installation' }));
import { helper } from '../server/lib/helper';

afterEach(() => { delete process.env.PDC_HELPER_PATH; mock.spawn.mockReset(); });
for (const configured of [false, true]) it('uses the ' + (configured ? 'isolated' : 'default') + ' helper with the same sudo boundary and stdin protocol', async () => {
  const path = configured ? '/usr/local/libexec/pvedc-upgrade-helper' : '/usr/local/libexec/pvedc-helper';
  if (configured) process.env.PDC_HELPER_PATH = path;
  let request = '';
  mock.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
    child.stdin.on('data', chunk => { request += chunk; });
    queueMicrotask(() => { child.stdout.write('{"ok":true}'); child.emit('close', 0); });
    return child;
  });
  await expect(helper({ operation: 'gost-restart' })).resolves.toEqual({ ok: true });
  expect(mock.spawn).toHaveBeenCalledWith('sudo', ['-n', '--', path], expect.objectContaining({ windowsHide: true }));
  expect(JSON.parse(request)).toEqual({ operation: 'gost-restart', instanceId: 'test-installation' });
});
