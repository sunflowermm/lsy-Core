/**
 * 从仓库 skills/standard/ 同步办公技能到 core/lsy-Core/skills/（李诗雅专用改写）。
 * 用法：node core/lsy-Core/scripts/sync-office-skills.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LSY_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(LSY_ROOT, '../..');
const SRC = path.join(REPO_ROOT, 'skills', 'standard');
const DEST = path.join(LSY_ROOT, 'skills');

const SKIP = new Set(['answer-format', 'assistant-core', 'office-env-setup']);

const REPLACEMENTS = [
  [/create_word_document/g, 'export_doc（先 write output/xxx.md）'],
  [/create_excel_document/g, 'write output/xxx.csv 或 run+pandas 生成 output/xxx.xlsx'],
  [/data\/ai-workspace(?:\/\{id\})?/g, 'uploads/、project/、output/'],
  [/Agent 工作区/g, '用户工作区（uploads/project/output）'],
  [/工作区根目录/g, '用户工作区根'],
  [/tools 工作流/g, '李诗雅工具'],
  [/web 工作流/g, '李诗雅工具'],
  [/desktop 工作流/g, '李诗雅工具'],
  [/``tools\.file\.runEnabled``/g, 'run 白名单'],
  [/aistream\.yaml[^\n]*/g, 'lsy.yaml / run 白名单（shell-tools）'],
  [/aistream\.tools\.file\.runEnabled/g, 'run 白名单（见 shell-tools）'],
  [/config\/default_config\/aistream\.yaml/g, 'core/lsy-Core/default/lsy.yaml'],
  [/customSkillRoots[^\n]*/g, 'core/lsy-Core/skills/（注入 system prompt）'],
  [/skills\/standard\/_references\/deps-matrix\.md/g, 'office-env-setup 依赖表'],
  [/读工作区 `ENV\.md`/g, '确认 run/export_doc/convert_document 是否可用（见 office-env-setup）'],
  [/工作区 `ENV\.md`/g, 'office-env-setup'],
  [/维护在根目录 \*\*`ENV\.md`\*\*/g, '能力说明见 office-env-setup'],
  [/更新「能力档位」[^\n]*/g, '在回复中说明探测结果'],
  [/写回 ENV\.md[^\n]*/g, '告知用户服务器能力限制'],
  [/open_path|open_explorer|open_browser/g, '侧栏 output/ 下载'],
  [/read_clipboard|write_clipboard|screenshot|system_info|disk_space/g, '（本服务无此工具）'],
];

function adaptForLsy(text, skillName) {
  let out = text;
  for (const [re, rep] of REPLACEMENTS) {
    out = out.replace(re, rep);
  }
  if (skillName === 'office-env-desktop') {
    return `---
name: office-lsy-export
description: 李诗雅无 desktop MCP；用 export_doc、convert_document、侧栏 output/ 下载
---

# 导出与交付（李诗雅）

本服务**没有** create_word_document / 本机打开文件夹等 desktop 工具。

| 需求 | 做法 |
|------|------|
| Word | write \`output/x.md\` → **export_doc** → \`output/x.docx\` |
| 读 doc/pdf | **convert_document** → txt/md → read |
| Excel | write \`output/x.csv\` 或 run+pandas → \`output/x.xlsx\` |
| 给用户文件 | 一律 \`output/\`，提醒侧栏下载 |

无 pandoc 时 export_doc 回退 md，见 doc-generate、office-env-setup。
`;
  }
  if (skillName === 'office-env-workspace') {
    out = out.replace(
      /## 禁止[\s\S]*$/,
      `## 李诗雅目录

| 目录 | 用途 |
|------|------|
| uploads/ | 用户上传，优先读 |
| output/ | **生成物**（报告、docx、csv） |
| project/ | 代码 |

禁止访问 chats/；禁止 write AGENTS.md。

## 禁止

- 不读写 chats/
- 不修改 AGENTS.md
`
    );
  }
  return out;
}

function copySkillDir(name) {
  const srcMd = path.join(SRC, name, 'SKILL.md');
  if (!fs.existsSync(srcMd)) return false;
  const destName = name === 'office-env-desktop' ? 'office-lsy-export' : name;
  const destDir = path.join(DEST, destName);
  fs.mkdirSync(destDir, { recursive: true });
  const raw = fs.readFileSync(srcMd, 'utf8');
  fs.writeFileSync(path.join(destDir, 'SKILL.md'), adaptForLsy(raw, name), 'utf8');
  return destName;
}

const copied = [];
for (const ent of fs.readdirSync(SRC, { withFileTypes: true })) {
  if (!ent.isDirectory() || ent.name.startsWith('_')) continue;
  if (SKIP.has(ent.name)) continue;
  const dest = copySkillDir(ent.name);
  if (dest) copied.push(dest);
}

console.log(`Synced ${copied.length} skills to ${DEST}`);
console.log(copied.sort().join(', '));
