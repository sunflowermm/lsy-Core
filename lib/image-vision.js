import fs from 'fs/promises';
import path from 'path';
import { normRel, assertAiReadable } from './path-policy.js';
import { guardPath, resolveWorkspaceContext } from './workspace-tools.js';
import { getLsyLlmConfig } from './llm-config.js';
import { runVisionAnalyze } from '#utils/llm/agent-session.js';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp'
};

/** Anthropic 单图建议上限（字节） */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function isImagePath(filePath) {
  const ext = path.extname(normRel(filePath)).toLowerCase();
  return IMAGE_EXT.has(ext);
}

export function imageMimeType(filePath) {
  return MIME_BY_EXT[path.extname(normRel(filePath)).toLowerCase()] || 'image/png';
}

export async function loadWorkspaceImage(workspace, tools, filePath) {
  const rel = assertAiReadable(filePath);
  if (!isImagePath(rel)) {
    return { success: false, error: '非图片格式', hint: '支持 png/jpg/jpeg/gif/webp/bmp' };
  }
  const full = guardPath(tools.resolvePath(rel), workspace);
  const stat = await fs.stat(full);
  if (!stat.isFile()) return { success: false, error: '不是文件' };
  if (stat.size > MAX_IMAGE_BYTES) {
    return {
      success: false,
      error: `图片过大 (${Math.round(stat.size / 1024 / 1024)}MB)，上限 ${MAX_IMAGE_BYTES / 1024 / 1024}MB`
    };
  }
  const buf = await fs.readFile(full);
  return {
    success: true,
    data: {
      path: rel,
      mediaType: imageMimeType(rel),
      base64: buf.toBase64(),
      size: stat.size
    }
  };
}

const DEFAULT_VISION_PROMPT =
  '请详细描述这张图片：可见文字（OCR）、主体对象、布局、颜色风格与可能的用途。若无法识别某部分请说明。';

/** 调用当前李诗雅 LLM（须支持 Anthropic 多模态 image block） */
export async function analyzeWorkspaceImage(ctx, filePath, prompt) {
  const { tools, workspace } = await resolveWorkspaceContext(ctx);
  const loaded = await loadWorkspaceImage(workspace, tools, filePath);
  if (!loaded.success) return loaded;

  const llmCfg = await getLsyLlmConfig();
  const { data } = loaded;
  try {
    const analysis = await runVisionAnalyze(llmCfg.provider, {
      mediaType: data.mediaType,
      base64: data.base64,
      prompt: String(prompt || '').trim() || DEFAULT_VISION_PROMPT,
      maxTokens: Math.min(4096, llmCfg.maxTokens ?? 4096)
    });
    return {
      success: true,
      data: {
        path: data.path,
        size: data.size,
        mediaType: data.mediaType,
        analysis
      }
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || String(err),
      hint: '请确认 LLM 端点支持识图（如 Claude Opus/Sonnet 多模态），且 anthropic_compat 网关未禁用 image 块'
    };
  }
}
