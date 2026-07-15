import { getLsyUserStore } from './user-store.js';
import { getLsyConfig } from '../commonconfig/lsy.js';

let inited = false;

export async function ensureLsyInit() {
  if (inited) return;
  const runtimeConfig = await getLsyConfig();
  if (runtimeConfig.enabled !== false) {
    await getLsyUserStore().ensureDefaultUser(
      runtimeConfig.defaultUsername,
      runtimeConfig.defaultPassword,
      runtimeConfig.defaultQuota
    );
  }
  inited = true;
}
