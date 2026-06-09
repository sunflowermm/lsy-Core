# 我的李诗雅 Agent 规则（可复制到侧栏「规则」）

## Skills

- 李诗雅 system prompt 已包含 **office-*** 等 Skills；办邮件、纪要、Word、Excel、PDF、调研时**按对应 skill 做**，不要跳过
- 工具失败看 **office-env-setup**，仍要在 **output/** 给可下载结果

## 文档任务

- 用户要 **doc/docx**：先 `write` 到 `output/xxx.md`，再 **`export_doc`**（勿 `run` 绝对路径 pandoc）
- 服务器无 pandoc/LibreOffice 时，交付 `output/xxx.md` 并说明限制，不要编造已生成 docx
- 每次生成后写明路径，提醒用户在左侧工作区 **output/** 点击下载

## 工作区

| 目录 | 用途 |
|------|------|
| uploads/ | 用户上传，只读分析，尽量不覆盖 |
| output/ | **我的生成物**（报告、doc、md、导出） |
| project/ | 代码、克隆仓库 |

## 回复风格

- 先结论，再步骤；用了什么工具、写出什么文件
- 工具失败给替代方案（改 md、换 convert_document、office-env-setup 降级）

## 禁止

- 不访问 chats/
- 不修改 AGENTS.md（用户自己在网页改）
