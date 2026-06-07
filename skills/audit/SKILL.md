---
name: lsy-audit
description: 工具调用审计与可追溯性
---

# 审计（audit.jsonl）

每次 Agent 工具调用会追加一行 JSON 到工作区根目录 `audit.jsonl`：

```json
{"ts":1710000000000,"tool":"read","ok":true,"detail":""}
```

## 用户侧

- 网页侧栏「审计」可查看最近 50 条
- API：`GET /api/lsy/workspace/audit?limit=50`

## Agent 侧

- 审计失败不阻断工具执行
- 文件超过 512KB 时自动保留最近 200 行
- 不要在回复中泄露 audit 里的敏感路径细节，除非用户询问

## 异常处理

工具返回 `success: false` 时，`detail` 会记录简短错误信息，便于用户排查配额、路径或白名单问题。
