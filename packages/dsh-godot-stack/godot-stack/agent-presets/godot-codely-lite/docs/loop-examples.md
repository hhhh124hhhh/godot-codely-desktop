# 工具长示例（按需加载）

`mcp__godot__*` 由 godot-mcp-server 经 dsh-mcp-client 提供。不确定参数先 `mcp__godot__help`。
一次只改一个意图。检查按实际影响选择，见 `methodology-2.0.md`：读回只证明文本/结构；代码需要编译/LSP，行为需要针对性引擎检查；可交付 / Phase 3 走三道闸。

## 工具地图

- 看结构：`scenes.list` / `scenes.info` / `nodes.list` / `nodes.get_property` / `scripts.read`
- 改工程：`nodes.add` / `nodes.set_property` / `scripts.create` / `scripts.write` / `scripts.attach`
- 运行：`project.run` / `project.stop` / `project.settings_get` / `project.settings_set`
- 资源与系统：`resources` / `input_map` / `signals` / `animation` / `tilemap` / `shader` / `physics` / `audio` / `navigation` / `ui`
- 编辑器与导出：`editor.launch` / `editor.scan` / `editor.play` / `editor.live_status` / `editor.stop` / `project.export`（需 `GODOT_PATH`）
- 工程扫描：`list_projects`（不需要 Godot 二进制）
- 会话开场：`config status`；`project_path` 不对就 `list_projects` 再 `config set project_path`
- 出图 / 语音：`generate_sprite` / `generate_image`（需 `VOLC_ARK_API_KEY`）；`text_to_speech`（需 DashScope key）
- 文档：`help`
- 编译证据：`project.verify` 给出真实编译和主场景冒烟输出。不能凭退出码 0 宣称玩法正确，那是可交付档的证据，不是小改动的默认检查

分组与动作名以 `help` 和 `skills/godot/SKILL.md` 为准（project / scenes / nodes / scripts / editor / config / resources / input_map / signals / animation / tilemap / shader / physics / audio / navigation / ui）。

## 结构改动：新建场景后停在 scenes.info

```
scenes(action="create", scene_path="scenes/game.tscn", root_type="Node2D", root_name="Game")
nodes(action="add", scene_path="scenes/game.tscn", name="Player", type="CharacterBody2D", parent=".")
nodes(action="add", scene_path="scenes/game.tscn", name="HitBox", type="CollisionShape2D", parent="Player")
scripts(action="create", script_path="scripts/player.gd", extends="CharacterBody2D", content="...")
scripts(action="attach", script_path="scripts/player.gd", scene_path="scenes/game.tscn", node_name="Player")
scenes(action="info", scene_path="scenes/game.tscn")
```

节点树复核只证明结构。新建脚本需编译/LSP 检查；角色移动任务还须针对性引擎检查，不能只因节点存在就宣称角色可用。不自动追加无关的完整验收。

## 结构改动：改属性

```
nodes(action="list", scene_path="scenes/game.tscn")
physics(action="body_config", scene_path="scenes/game.tscn", name="Player", collision_layer=2, collision_mask=1)
nodes(action="get_property", scene_path="scenes/game.tscn", name="Player", property="collision_layer")
```

UI 文案同样停在结构检查：

```
scenes(action="info", scene_path="scenes/main_ui.tscn")
ui(action="create_control", scene_path="scenes/main_ui.tscn", name="ScoreLabel", type="Label", parent=".")
nodes(action="set_property", scene_path="scenes/main_ui.tscn", name="ScoreLabel", property="text", value="Score: 0")
scenes(action="info", scene_path="scenes/main_ui.tscn")
```

像素对比（`vision_pixel_diff`，差异 > 5% 再裁剪定位）留给画面验收，不是每次改 Label 的步骤。

## 行为改动：针对性运行与失败复验

控制台报 `Invalid call. Nonexistent function 'move_and_slide' on base: 'Node2D'` 时，错误本身依赖引擎，修完运行复核：

```
scripts(action="read", script_path="scripts/player.gd")
# 定位：节点类型是 Node2D，没有 move_and_slide。只改 extends，不重写整个脚本。
scripts(action="write", script_path="scripts/player.gd", content="extends CharacterBody2D\n...")
project(action="run")
```

检查失败就定位修复，并重跑失败项；通过或明确阻塞后再结束。不要无关地重复扫描环境或自动扩大验收范围。

只改注释或非执行文本时，可用 `scripts.read` 确认补丁；类型标注影响编译，须用对应编译/LSP 检查。

## 可交付

Phase 3 或用户明确说可以交付时，才按 `methodology-2.0.md` 跑编译闸、冒烟闸、功能闸，并带上本次任务的具体断言。
