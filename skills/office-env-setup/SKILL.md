---
name: office-env-setup
description: 李诗雅环境探测与降级；export_doc/run/convert_document 不可用时的办事路径
---

## 何时使用

- 要 docx/xlsx/pdf/ppt、Python 脚本，但不确定服务器有没有 pandoc/Python
- `export_doc`、`run`、`convert_document` 失败
- **任何 office-* 格式任务前**可先快速探测

## 李诗雅能力档位

| 档 | 条件 | 能做什么 |
|----|------|----------|
| A | read/write/list_files/grep | Markdown、聊天表格、写 output/*.md |
| B | + export_doc / convert_document | md→docx、doc/pdf→txt |
| C | + run（白名单） | pandoc、python、pip、pandas |
| D | + web_search / web_fetch | 调研、核对公开信息 |

**无** desktop、无本机打开文件夹；交付文件在 **output/**，请用户侧栏下载。

## 快速探测（C 档；执行前说明并确认）

```bash
python --version
pandoc --version
```

或先试：`write output/_probe.md` → `export_doc` → 是否得到 docx。

## 任务 → 主路径 → 降级

| 任务 | 首选 | 降级 |
|------|------|------|
| Word | write output/x.md → **export_doc** | 只交付 .md |
| 读 doc/pdf | **convert_document** → read | 请用户粘贴 |
| Excel | run+pandas → output/x.xlsx | output/x.csv 或 office-sheet 表 |
| PPT | run+python-pptx | Markdown 大纲（office-pptx） |
| PDF 处理 | run+pypdf/qpdf | convert_document 抽文本 |
| 图表 | run+matplotlib → output/*.png | 文字/MD 表 |
| 调研 | web_search → web_fetch | 用户供材料 |

**原则**：先给可下载的降级产物（output/），再说明缺什么依赖。

## pip / run

- 白名单见 **shell-tools**；禁止 sudo、rm -rf、外网 curl
- pip 前说明包名与用途，用户确认后再 `run pip install --user …`

## 关联

- 路径边界 → web-agent-tools
- docx 流程 → doc-generate
- 读文档 → doc-convert
