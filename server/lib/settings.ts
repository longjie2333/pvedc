import { settingsSchema, secretKeys, type SafeSettings, type Settings } from '../../shared/schema';
import { getDb } from './db';
import { seal, unseal } from './crypto';
import { readFileSync } from 'node:fs';

export function getSettings(): Settings {
  const row = getDb().prepare('SELECT value FROM settings WHERE id=1').get() as { value: string } | undefined;
  if (row) {
    const values = JSON.parse(row.value);
    for (const key of secretKeys) values[key] = values[key] ? unseal(values[key]) : '';
    return settingsSchema.parse(values);
  }
  const initial: Record<string, unknown> = process.env.PDC_BOOTSTRAP_FILE ? JSON.parse(readFileSync(process.env.PDC_BOOTSTRAP_FILE, 'utf8')) : {};
  if (process.env.PDC_INITIAL_SETTINGS) Object.assign(initial, JSON.parse(process.env.PDC_INITIAL_SETTINGS));
  if (process.env.PDC_INITIAL_CONFIG) Object.assign(initial, JSON.parse(process.env.PDC_INITIAL_CONFIG).settings || {});
  const env: Record<string, string> = { PDC_PVE_URL: 'pveUrl', PDC_PVE_NODE: 'pveNode', PDC_PVE_TOKEN_ID: 'pveTokenId', PDC_PVE_TOKEN_SECRET: 'pveTokenSecret', PDC_PVE_CA: 'pveCa', PDC_GOST_API: 'gostApi', PDC_GOST_USER: 'gostUser', PDC_GOST_PASSWORD: 'gostPassword', PDC_PUBLIC_ORIGIN: 'publicOrigin' };
  for (const [name, key] of Object.entries(env)) if (process.env[name]) initial[key] = process.env[name];
  const settings = settingsSchema.parse(initial);
  saveSettings(settings);
  return settings;
}
export function saveSettings(settings: Settings) {
  const value = { ...settingsSchema.parse(settings) };
  for (const key of secretKeys) value[key] = value[key] ? seal(value[key]) : '';
  getDb().prepare('INSERT INTO settings(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(value));
}
export function safeSettings(): SafeSettings {
  const settings = getSettings();
  const secrets = Object.fromEntries(secretKeys.map(key => [key, !!settings[key]])) as SafeSettings['secrets'];
  const { pveTokenSecret: _pve, gostPassword: _gost, relayPassword: _relay, ...safe } = settings;
  return { ...safe, secrets };
}
