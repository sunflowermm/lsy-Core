---
name: lsy-file-uploads
description: 用户上传文件与工作区 uploads/ 目录规范
---

# 用户上传与工作区

## 目录隔离
- 每账号独立：`data/lsy/users/{username}/`
- 网页上传 → `uploads/`（AI 可直接 read / convert_document）

## 处理流程
1. `list_files({ dirPath: "uploads" })` 查看上传
2. 二进制/Office/PDF → `convert_document` → `read`
3. 按需 `write` / `run` 处理

## 常见类型
| 扩展名 | 做法 |
|--------|------|
| .txt .md .json .csv | 直接 read |
| .doc .docx .pdf .odt | convert_document → read |
| .zip | run unzip，再 list_files |

## 注意
- 勿访问 `chats/` 目录
- 输出新文件建议放在工作区根或子目录，勿覆盖 uploads 原文件
