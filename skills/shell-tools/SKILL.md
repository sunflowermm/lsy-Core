---
name: lsy-shell-tools
description: 工作区内 shell 命令（网页白名单）
---

# Shell Tools

工作区 cwd 下执行，**仅白名单**（见 `lib/run-policy.js`）：

- pandoc / soffice
- npm / pnpm（test、run、install、build、lint）
- node / python / pip install
- git status / diff / log / show / branch
- ls / cat / grep 等只读命令

禁止：sudo、rm -rf、curl/wget、git push、管道 sh 等。

```bash
run({ command: "npm test" })
run({ command: "pandoc uploads/a.docx -o uploads/a.txt" })
```

**md → docx** 请用 `export_doc`，不要手写绝对路径 pandoc。

`git clone` 请用 `gh_clone` 工具（需管理员在 `lsy.yaml` 开启 `tools.allowGhClone`）。
