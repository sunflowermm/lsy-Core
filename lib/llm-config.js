import LLMFactory from '#factory/llm/LLMFactory.js';
import { getLsyConfig } from '../commonconfig/lsy.js';

const DEFAULT_MAX_TOOL_ROUNDS = 16;

export async function getLsyLlmConfig() {
  const runtimeConfig = await getLsyConfig();
  const llm = runtimeConfig.llm || {};
  const provider = String(llm.provider || '').trim().toLowerCase();
  if (!provider) {
    throw new Error(
      '李诗雅 LLM 未配置 provider：请在 data/lsy/lsy.yaml 设置 llm.provider（对应 config/*_llm.yaml 的 providers[].key，如 anthropic_compat 端点）'
    );
  }

  const profile = LLMFactory.getProviderConfig(provider);
  if (!profile) {
    throw new Error(`李诗雅 LLM 端点 "${provider}" 不存在，请先在 LLM 工厂 providers[] 中配置`);
  }
  if (String(profile.protocol || '').toLowerCase() !== 'anthropic') {
    throw new Error(`李诗雅 Agent 需要 anthropic 协议端点，当前 "${provider}" 为 ${profile.protocol}`);
  }

  const maxToolRounds = Math.min(
    32,
    Math.max(1, Number(llm.maxToolRounds) || DEFAULT_MAX_TOOL_ROUNDS)
  );

  return {
    provider,
    model: profile.model || profile.chatModel || provider,
    factory: profile.factory,
    factoryType: profile.factoryType,
    protocol: profile.protocol,
    maxToolRounds,
    maxTokens: profile.maxTokens ?? profile.max_tokens ?? 8192,
    temperature: profile.temperature ?? 0.7
  };
}

export function maskLlmConfigPublic(llm = {}, profile = null) {
  const provider = String(llm.provider || '').trim();
  const resolved = profile || (provider ? LLMFactory.getProviderConfig(provider) : null);
  return {
    provider: provider || null,
    model: resolved?.model || resolved?.chatModel || null,
    factory: resolved?.factory || null,
    maxToolRounds: llm.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS,
    configured: Boolean(provider && resolved && LLMFactory.hasProvider(provider) && Boolean(String(resolved.apiKey || '').trim()))
  };
}
