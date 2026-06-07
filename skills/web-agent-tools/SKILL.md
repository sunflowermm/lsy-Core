---
name: lsy-web-agent-tools
description: 网页 Agent 安全工具白名单与路径边界
---

# 网页 Agent 工具（安全面）

## 允许工具

| 工具 | 用途 | 边界 |
|------|------|------|
| `read` | 读文本文件 | 不可读 `chats/`；**图片勿 read** |
| `view_image` | 识图 | png/jpg/gif/webp，调用多模态 LLM |
| `write` | 写文件 | 仅 `uploads/` `project/` `output/` |
| `grep` | 搜索 | 同 read |
| `list_files` | 列目录 | 不含 `chats/` |
| `convert_document` | doc/pdf → txt/md | 输出到可写目录 |
| `web_search` | 网页搜索（Bing/百度，可配置） | 国内服务器可用 |
| `web_fetch` | 抓取 URL | 同上 |
| `run` | shell | 白名单：pandoc/npm/node/python/git status 等 |
| `gh_clone` | 克隆仓库 | **默认关闭**，需 `lsy.yaml` → `tools.allowGhClone: true` |

## 禁止 AI 写入

- `AGENTS.md`：用户在网页「规则」面板编辑，保存后立即注入 system prompt
- `chats/`：对话历史，仅系统读写

## 工作区布局

```
data/lsy/users/{username}/
├── AGENTS.md      ← 用户规则（网页编辑）
├── uploads/       ← 上传与文档
├── project/       ← 代码/克隆仓库
├── output/        ← AI 生成物
├── chats/         ← 对话存档（AI 不可读）
└── audit.jsonl    ← 工具调用审计
```

## 回复要求

- 先说明将用哪个工具、为何安全
- 写文件前确认路径在可写目录内
- 需要 `gh_clone` 但未开启时，提示用户在配置中开启或手动上传 zip
