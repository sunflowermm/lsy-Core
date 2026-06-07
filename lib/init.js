import { getLsyUserStore } from './user-store.js';
import { getLsyConfig } from '../commonconfig/lsy.js';

let inited = false;

export async function ensureLsyInit() {
  if (inited) return;
  const cfg = await getLsyConfig();
  if (cfg.enabled !== false) {
    await getLsyUserStore().ensureDefaultUser(
      cfg.defaultUsername,
      cfg.defaultPassword,
      cfg.defaultQuota
    );
  }
  inited = true;
}
