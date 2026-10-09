import { expect, it } from 'vitest';
import { taskSucceeded, volumeSizeGiB } from '../server/lib/pve';

it('accepts PVE warning completion without treating errors as successful', () => {
  expect(taskSucceeded('OK')).toBe(true);
  expect(taskSucceeded('WARNINGS: 1')).toBe(true);
  expect(taskSucceeded('WARNINGS: 12')).toBe(true);
  expect(taskSucceeded('unable to create CT')).toBe(false);
  expect(taskSucceeded('WARNINGS: invalid')).toBe(false);
  expect(taskSucceeded(undefined)).toBe(false);
});
it('accounts for virtual disk sizes in PVE configuration units', () => {
  expect(volumeSizeGiB('local-lvm:vm-100-disk-0,size=8G')).toBe(8);
  expect(volumeSizeGiB('local-lvm:vm-100-disk-0,size=2048M')).toBe(2);
  expect(volumeSizeGiB('local-lvm:vm-100-disk-0,size=1T')).toBe(1024);
});
