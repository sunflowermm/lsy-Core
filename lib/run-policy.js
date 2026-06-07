import { InputValidator } from '#utils/input-validator.js';

/** 网页 Agent 允许的 shell 命令前缀（白名单） */
const ALLOW = [
  /^pandoc\b/i,
  /^soffice\b/i,
  /^npm\s+(test|run|install|ci|build|lint|exec)\b/i,
  /^pnpm\s+(test|run|install|exec|build|lint)\b/i,
  /^node\b/i,
  /^python3?\b/i,
  /^pip3?\s+install\b/i,
  /^git\s+(status|diff|log|show|branch)\b/i,
  /^unzip\b/i,
  /^(ls|dir|cat|type|head|tail|find|grep|wc|echo)\b/i
];

const EXTRA_DENY = [
  /\bsudo\b/i,
  /\brm\s+-/i,
  /\bdel\s+\/f/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bgit\s+clone\b/i,
  /\bgit\s+push\b/i,
  /\|\s*sh\b/i,
  /Invoke-Expression/i,
  /Format-Volume/i
];

export function assertSafeRun(command, { allowGhClone = false } = {}) {
  const cmd = InputValidator.validateCommand(command);
  const trimmed = cmd.trim();
  if (allowGhClone && /^git\s+clone\b/i.test(trimmed)) {
    return cmd;
  }
  for (const re of EXTRA_DENY) {
    if (re.test(cmd)) {
      if (re.source.includes('clone') && allowGhClone) continue;
      throw new Error(`命令不在网页 Agent 允许范围内: ${cmd.slice(0, 80)}`);
    }
  }
  if (!ALLOW.some((re) => re.test(trimmed))) {
    throw new Error(`仅允许白名单命令（pandoc/npm/node/python/git status 等）: ${cmd.slice(0, 80)}`);
  }
  return cmd;
}
