---
name: lsy-coding-workflow
description: Coding Agent 式编程任务工作流
---

# Coding Agent 工作流

## 执行顺序
1. **理解** — 复述任务与验收标准
2. **勘察** — `list_files` 看结构
3. **阅读** — `read` / `grep` 定位相关代码
4. **实现** — `write` 修改或创建文件
5. **验证** — `run` 执行测试/构建/lint
6. **汇报** — 结论 + 改动文件 + 如何验证

## 常用 run 命令
```bash
npm install && npm test
npm run build
python -m pytest
go test ./...
git status
```

## 原则
- 最小改动，匹配现有风格
- 不臆造文件内容，先 read
- 测试失败则读输出再修
- 需要参考实现时用 `gh_clone` + read

## 与上传文件结合
用户上传代码/文档时，从 uploads/ 读取或复制到项目目录后再开发。
