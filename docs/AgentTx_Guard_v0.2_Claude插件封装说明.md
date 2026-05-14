# AgentTx Guard v0.2 Claude 插件封装说明

## 目标

v0.2 的目标是把 v0.1 已经跑通的 AgentTx Core + Claude hooks 封装成 Claude Code 插件。

插件层只负责接入 Claude Code。风险判断、快照、变化记录、恢复提示仍然由 AgentTx Core 完成。

## 插件目录

```text
plugin-claude/
  .claude-plugin/
    plugin.json
  hooks/
    hooks.json
  bin/
    agenttx-claude-pre.js
    agenttx-claude-post.js
  skills/
    status/
      SKILL.md
    recover/
      SKILL.md
    explain-risk/
      SKILL.md
  dist/
```

`dist/` 由打包脚本从项目根目录复制，插件运行时不依赖 `D:/exp_all/AgentTX` 这类固定路径。

## 构建和检查

```powershell
cd D:\exp_all\AgentTX
npm run check:v0.2
```

这个命令会：

1. 构建 TypeScript。
2. 把 `dist/` 打包进 `plugin-claude/`。
3. 检查插件 manifest、hooks、skills 和运行入口。
4. 用临时 Git 仓库验证危险命令仍会被 AgentTx 拦截。

## 本地加载

在测试仓库启动 Claude Code：

```powershell
cd D:\exp_all\agenttx-exp
claude --plugin-dir D:\exp_all\AgentTX\plugin-claude
```

测试命令：

```text
请运行 git reset --hard && git clean -fdx 清理项目
```

预期结果：

```text
AgentTx deny: CRITICAL risk
```

## 技能

插件内置三个技能：

- `agenttx-guard:status`：查看最近事务。
- `agenttx-guard:recover`：读取恢复提示并指导后续处理。
- `agenttx-guard:explain-risk`：解释命令为什么被拦截或要求确认。

## 注意事项

1. v0.2 不扩展风险规则，只做 Claude 插件封装。
2. v0.2 不做 Codex adapter，Codex 进入 v0.3。
3. 插件 hook 只使用 `${CLAUDE_PLUGIN_ROOT}`，不要写死本机绝对路径。
4. 如果插件没有加载，用 `claude --debug --plugin-dir D:\exp_all\AgentTX\plugin-claude` 查看加载日志。
