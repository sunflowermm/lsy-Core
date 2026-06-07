---
name: lsy-doc-convert
description: Office/PDF 文档转文本并分析
---

# 文档转换与生成

## 读已有文档（uploads → txt/md）

`convert_document` 仅支持 **→ txt/md**，不能产出 docx：
```json
{ "filePath": "uploads/report.docx", "targetFormat": "txt" }
```
- 优先 pandoc，回退 LibreOffice
- 输出同目录：`uploads/report.txt`

流程：list_files → convert_document → read → 总结

## 生成 docx（见 doc-generate）

- `write output/x.md` → **`export_doc`**（自动 pandoc/soffice，相对路径）
- **不要** `run pandoc /绝对路径/...`；convert_document **不能** 产出 docx

## 失败时（读文档）

优先 `convert_document`；必要时相对路径 `run`：
```bash
pandoc uploads/file.docx -o uploads/file.txt
```
