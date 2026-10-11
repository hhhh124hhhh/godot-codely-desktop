# dsh-godot-stack

Godot Codely 预装插件：把 godot-extensions 全家桶打进出厂配置，首启自动落位。

## 内置内容

| 资源 | 落位目标 |
|---|---|
| `godot-stack/agent-presets/godot-codely-lite/`（preset.yml + agent.cordis.yml） | `<dshHome>/.agent-presets/godot-codely-lite` |
| `godot-stack/mcp/godot-mcp-server/`（23 工具 MCP server 源码） | `<dshHome>/.godot/mcp-server` |
| `skills/godot/`（7 个领域技能 + SKILL.md 索引） | 内置技能，由 DSH skill 系统自动发现（bundled） |

`<dshHome>` = `DSH_HOME` 环境变量，未设置时为 `~/.dsh`。

## 工作机制

- 插件随 `build/dsh-desktop.patch.yml` 的 `- insert: dsh-godot-stack` 挂载，每次 Harness 启动时 `apply()` 执行。
- 全部 best-effort：失败只写 warning，不阻塞启动。
- MCP 注册：若 `<dshHome>/.godot/mcp-server/build/index.js` 已构建，则把 `mcpServers.godot` 写入 `<dshHome>/settings.json`（不覆盖已有配置）；未构建则只复制源码并提示：
  ```
  cd <dshHome>/.godot/mcp-server && npm install && npm run build
  ```

## 开发

```bash
npm install            # file: 依赖链接本包
npm run build          # 编译主进程后打包时插件随 asar 进入
```

## 更新资源

改 `D:\godot-extensions` 后重新复制对应目录到本包：
- `agent-presets/godot-codely-lite` → `godot-stack/agent-presets/`
- `godot-codely/godot-mcp-server` → `godot-stack/mcp/`
- `skills/godot` → `skills/godot`
