---
name: lsy-image-vision
description: 工作区图片识图（view_image）
---

# 图片识图

## 何时用

- 用户上传 `uploads/*.png|jpg|gif|webp` 并要求分析、OCR、描述内容
- **禁止**对图片使用 `read`（会读二进制乱码并卡住）

## 用法

```
view_image({ filePath: "uploads/xxx.png" })
view_image({ filePath: "uploads/chart.png", prompt: "提取图中所有文字与数据" })
```

## 要求

- 模型须支持 Anthropic 多模态（如 Claude Opus/Sonnet）
- 单图 ≤ 8MB
- 识图结果在 tool 返回的 `analysis` 字段，请基于该文本向用户总结
