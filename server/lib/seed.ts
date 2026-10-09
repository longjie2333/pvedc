import { initialConfigSchema } from '../../shared/schema';
import { getDb, meta, setMeta, audit } from './db';
import { getSettings } from './settings';
import { saveNetwork, saveProfile, saveStudents } from './catalog';
import { ensure } from './errors';
import { profiles } from './records';

export function initializeSeed() {
  if (meta('initial_config_imported')) return;
  if (!process.env.PDC_INITIAL_CONFIG) { setMeta('initial_config_imported', '1'); return; }
  const config = initialConfigSchema.parse(JSON.parse(process.env.PDC_INITIAL_CONFIG));
  getDb().transaction(() => {
    ensure(!(getDb().prepare('SELECT count(*) count FROM students').get() as { count: number }).count && !profiles().length, 409, '首次配置导入要求空名单和资源配置');
    const settings = getSettings();
    for (const network of config.networks) saveNetwork(network, network.id);
    for (const profile of config.profiles) saveProfile(profile, profile.id);
    saveStudents(config.students);
    ensure(!settings.defaultProfileId || profiles().some(p => p.id === settings.defaultProfileId && p.published && p.enabled), 400, '首次默认配置不存在、未发布或已停用');
    ensure(!settings.registrationOpen, 400, '首次导入后请先在 Web 应用网络，再开放学生申请');
    setMeta('initial_config_imported', '1');
    audit('system', 'initial-config.import');
  }).immediate();
}
