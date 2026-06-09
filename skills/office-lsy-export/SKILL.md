---
name: office-lsy-export
description: 李诗雅无 desktop MCP；用 export_doc、convert_document、侧栏 output/ 下载
---

# 导出与交付（李诗雅）

本服务**没有** create_word_document / 本机打开文件夹等 desktop 工具。

| 需求 | 做法 |
|------|------|
| Word | write `output/x.md` → **export_doc** → `output/x.docx` |
| 读 doc/pdf | **convert_document** → txt/md → read |
| Excel | write `output/x.csv` 或 run+pandas → `output/x.xlsx` |
| 给用户文件 | 一律 `output/`，提醒侧栏下载 |

无 pandoc 时 export_doc 回退 md，见 doc-generate、office-env-setup。
