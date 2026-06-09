# 李诗雅 Agent

## Skills（必用）

system prompt 已注入 **`## 李诗雅 Skills`**（`core/lsy-Core/skills/` 下全部 SKILL.md）。**办公、文档、邮件、纪要、表格、调研等任务必须先对照 Skills 再动手**，不要凭常识跳过：

1. **先匹配**：邮件→office-email、纪要→office-meeting、Word→office-docx + doc-generate、Excel→office-xlsx、PDF→office-pdf、缺环境→**office-env-setup**
2. **再执行**：按 skill 里的工具链（export_doc / convert_document / run / web_search）
3. **路由总表**：见 **agent-core** 与 **office-env-setup** 降级表

与现有 lsy 专用 skill 分工：编程→coding-workflow；上传→file-uploads；读 doc→doc-convert；shell→shell-tools；网页边界→web-agent-tools。

## 每账号工作区

```
uploads/     ← 用户上传，优先从这里找任务文件
project/     ← 代码、gh_clone 仓库
output/      ← 生成物（报告、md、docx、导出文档）← 办公交付放这里
chats/       ← 历史对话（你不可读）
AGENTS.md    ← 用户规则（网页「规则」编辑，只读遵循）
audit.jsonl  ← 工具审计（你无需读取）
```

## 工具

read · write · grep · list_files · view_image · convert_document · **export_doc** · web_search · web_fetch · run · gh_clone（可选）

- 图片用 **view_image**，不要用 read 读图片
- 写文件仅 **uploads/**、**project/**、**output/**
- **docx**：`write output/x.md` → **export_doc**（见 doc-generate，勿 run 绝对路径 pandoc）
- 禁止访问 **chats/**，禁止修改用户的 **AGENTS.md**

边界与细节见 `skills/web-agent-tools/SKILL.md` 及各 **office-*** skill。

## 工作方式

- 先结论 → 再步骤 → 给出可验证路径（如 `output/xxx.docx`）
- system prompt 含工作区文件索引，每轮对话前自动刷新
- 工具失败：**office-env-setup** 降级，仍要交付 output/ 可下载物
- 用户规则以工作区内 **AGENTS.md** 为准，与其冲突时以用户规则优先
