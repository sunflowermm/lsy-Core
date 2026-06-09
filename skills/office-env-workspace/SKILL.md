---
name: office-env-workspace
description: 用户工作区（uploads/project/output）文件操作：read/write/list_files/grep/create/delete；cwd 为 uploads/、project/、output/
---

## 何时使用

要在工作区找文件、读配置、写草稿、批量搜关键字、整理目录。**A 档基础能力，几乎总是可用。**

## 范围

- **cwd**：`uploads/、project/、output//`（与 `tools.file.workspace` 一致）
- 项目源码在仓库根，默认**不要**改；除非用户明确要动代码并选 `project` 工作区

## 李诗雅工具工具

| 工具 | 用途 |
|------|------|
| `list_files` | 列目录（可递归） |
| `read` | 读文本/代码（有大小上限） |
| `write` / `create_file` | 新建或覆盖 |
| `modify_file` | 局部替换 |
| `delete_file` | 删除（需确认） |
| `grep` | 按正则搜文件内容 |

## 习惯

1. 先 `list_files` 再 `read`，避免猜路径
2. 大文件先 `grep` 定位再分段 `read`
3. 办公产出统一放 `docs/`、`exports/`、`scripts/`
4. 环境清单能力说明见 office-env-setup
5. 长文档分章放 `docs/<项目>/`（见 office-long-doc）

## 缺其他能力时

工作区仍可交付 **Markdown / 纯文本 / JSON**——这是所有降级的最后落脚点。见 **office-env-setup**。

## 李诗雅目录

| 目录 | 用途 |
|------|------|
| uploads/ | 用户上传，优先读 |
| output/ | **生成物**（报告、docx、csv） |
| project/ | 代码 |

禁止访问 chats/；禁止 write AGENTS.md。

## 禁止

- 不读写 chats/
- 不修改 AGENTS.md
