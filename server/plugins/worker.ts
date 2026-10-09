import { definePlugin } from 'nitro';
import { startWorker } from '../lib/worker';
import { initializeAuth } from '../lib/auth';
import { getSettings } from '../lib/settings';
import { initializeSeed } from '../lib/seed';

export default definePlugin(app => {
  initializeSeed(); getSettings(); initializeAuth();
  const stop = startWorker();
  app.hooks.hook('close', stop);
});
