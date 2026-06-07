import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import paths from '#utils/paths.js';
import ConfigBase from '#infrastructure/commonconfig/commonconfig.js';

/** 产品 Core 内默认模板（禁止放到 config/default_config/） */
const DEFAULT_SOURCE = path.join(paths.root, 'core', 'lsy-Core', 'default', 'lsy.yaml');

export default class LsyConfig extends ConfigBase {
  constructor() {
    super({
      name: 'lsy',
      displayName: '李诗雅',
      description: '李诗雅 Agent：账号、LLM 指针、工具与安全策略',
      filePath: 'data/lsy/lsy.yaml',
      fileType: 'yaml',
      schema: {
        fields: {
          enabled: {
            type: 'boolean',
            label: '启用李诗雅',
            description: '关闭后对话与管理 API 不可用',
            default: true,
            component: 'Switch'
          },
          'llm.provider': {
            type: 'string',
            label: 'LLM 端点',
            description: 'LLM 工厂 providers[].key；API 密钥在 data/server_bots/{port}/*_llm.yaml',
            default: '',
            component: 'Input'
          },
          'llm.maxToolRounds': {
            type: 'number',
            label: '工具调用最大轮次',
            description: '单次对话内 Agent 工具循环上限（1–32）',
            default: 16,
            min: 1,
            max: 32,
            component: 'InputNumber'
          },
          defaultQuota: {
            type: 'number',
            label: '新账号默认配额',
            description: '管理台新建用户时的默认调用次数；0 表示无限制',
            default: 100,
            min: 0,
            component: 'InputNumber'
          },
          defaultUsername: {
            type: 'string',
            label: '首次启动默认账号',
            description: '仅当该用户名尚不存在时自动创建；2–32 位小写字母、数字、_、-',
            default: 'demo',
            component: 'Input'
          },
          defaultPassword: {
            type: 'string',
            label: '首次启动默认密码',
            description: '留空则首次创建时随机生成并写入日志；已有账号不受影响',
            default: '',
            component: 'InputPassword'
          },
          'tools.allowGhClone': {
            type: 'boolean',
            label: '允许 gh_clone',
            description: '允许将 GitHub 仓库克隆到用户 project/ 目录',
            default: false,
            component: 'Switch'
          },
          'search.provider': {
            type: 'string',
            label: '网页搜索引擎',
            description: 'web_search 工具使用的搜索引擎',
            default: 'auto',
            component: 'Select',
            options: [
              { label: '自动（国内优先）', value: 'auto' },
              { label: 'Bing 中国', value: 'bing-cn' },
              { label: '百度', value: 'baidu' },
              { label: 'DuckDuckGo', value: 'duckduckgo' }
            ]
          },
          'admin.allowLoopbackBypass': {
            type: 'boolean',
            label: '管理台 127 免 API Key',
            description: '仅本机开发可开；生产环境务必关闭',
            default: false,
            component: 'Switch'
          }
        }
      }
    });
  }

  async _ensureRuntimeFile() {
    const targetPath = this._resolveFilePath();
    try {
      await fs.access(targetPath);
      return;
    } catch { /* 首次启动 */ }

    if (!existsSync(DEFAULT_SOURCE)) {
      throw new Error(
        `李诗雅配置模板缺失: ${DEFAULT_SOURCE}。产品 Core 模板须在 core/lsy-Core/default/，不得使用 config/default_config/lsy.yaml`
      );
    }
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(DEFAULT_SOURCE, targetPath);
  }

  async read(useCache = true) {
    await this._ensureRuntimeFile();
    const data = await super.read(useCache);
    if (data && typeof data.tools !== 'object') {
      data.tools = { allowGhClone: false };
    }
    if (data && typeof data.llm !== 'object') {
      data.llm = {};
    }
    if (data && typeof data.admin !== 'object') {
      data.admin = { allowLoopbackBypass: false };
    }
    if (data && typeof data.search !== 'object') {
      data.search = { provider: 'auto' };
    }
    return data;
  }
}

let cached = null;
export async function getLsyConfig() {
  if (!cached) cached = new LsyConfig();
  return cached.read();
}
