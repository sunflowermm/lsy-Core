---
name: lsy-doc-generate
description: 生成 Word/Markdown 文档到 output/ 并告知用户下载
---

# 生成文档（doc / docx / md）

## 硬性规则

1. **生成物只写 `output/`**（用户侧栏可点击下载）
2. 回复写明相对路径（如 `output/report.docx`）
3. **禁止**在 `run` 里使用绝对路径；cwd 已是用户工作区

## 推荐流程（docx）

1. `write` → `output/标题.md`
2. **`export_doc`** → `{ "filePath": "output/标题.md" }`
3. 成功：告知 `output/标题.docx`；失败：说明仅保留 `.md`，提示安装 pandoc

不要用 `run pandoc /root/...` 这种绝对路径。

## 服务器无 pandoc 时

- `export_doc` 会返回 `fallback: output/xxx.md`
- 明确告诉用户：可下载 md，或请管理员 `apt install pandoc`

## 禁止

- 不要谎称已生成 docx 而文件不存在
- 不要把生成物只写在聊天里不落盘
