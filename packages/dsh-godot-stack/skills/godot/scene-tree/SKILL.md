---
name: scene-tree
description: Godot 场景树专家。覆盖 .tscn 文件格式、节点树读写（scenes.*/nodes.* 工具）、信号连接、输入映射。当新建/修改场景、增删节点、设置属性、连接信号、绑定输入时加载本技能。
---

# 场景树操作（scene-tree）

## .tscn 格式要点

- 场景 = 节点树（Node），`.tscn` 是文本格式，由 godot-mcp-server 直接解析/改写，无需编辑器常驻
- 节点路径从根（`.`）算起：`UI/StartButton`、`Player/HitBox`
- 改属性先查：`nodes(action="list")` / `nodes(action="get_property")`，**不要凭空猜节点路径 / 属性名 / 方法名**
- 一次只改一件事，改完用 `scenes.info` 复核

## 场景工具（scenes.*）

| action | 说明 |
|--------|------|
| create | 新建场景（scene_path + root_type + root_name） |
| list / info | 列场景 / 看整棵节点树 |
| delete / duplicate | 删除 / 复制场景 |
| set_main | 设为主场景 |

## 节点工具（nodes.*）

| action | 说明 |
|--------|------|
| add | 加节点（name + type + parent） |
| remove / rename | 删 / 改名 |
| list | 列节点树 |
| set_property / get_property | 读写属性（如 `text`、`theme_override_font_sizes/font_size`、`collision_layer`） |

## 信号连接（signals.*）

- `list` 确认两端 → `connect(signal, from, to, method)` → `list` 复核
- 示例：把 Button 的 `pressed` 连到 Player 的 `on_button_pressed`

## 输入映射（input_map.*）

- `list` 看现有 → `add_action(name, deadzone)` → `add_event(name, event_type, event_value)` → `list` 复核
- 示例：`jump` 动作绑 `KEY_SPACE`

## 实操示例

### 新建场景并添加主角

```
Step 1: scenes(action="create", scene_path="scenes/game.tscn", root_type="Node2D", root_name="Game")
Step 2: nodes(action="add", scene_path="scenes/game.tscn", name="Player", type="CharacterBody2D", parent=".")
Step 3: nodes(action="add", scene_path="scenes/game.tscn", name="HitBox", type="CollisionShape2D", parent="Player")
Step 4: scripts(action="create", script_path="scripts/player.gd", extends="CharacterBody2D", content="extends CharacterBody2D\n\nconst SPEED = 200.0\n\nfunc _physics_process(delta):\n\tvar direction = Input.get_vector(\"move_left\", \"move_right\", \"move_up\", \"move_down\")\n\tvelocity = direction * SPEED\n\tmove_and_slide()\n")
Step 5: scripts(action="attach", script_path="scripts/player.gd", scene_path="scenes/game.tscn", node_name="Player")
Step 6: scenes(action="info", scene_path="scenes/game.tscn")   # 结构复核到此可停
# 只有「能不能动」这类必须引擎才知道的行为，才再加一次 project.run。不要接着跑冒烟/功能自测。
```

### 修改已有节点属性

```
Step 1: nodes(action="list", scene_path="scenes/game.tscn")                              # 确认 Player 存在
Step 2: physics(action="body_config", scene_path="scenes/game.tscn", name="Player", collision_layer=2, collision_mask=1)
Step 3: nodes(action="get_property", scene_path="scenes/game.tscn", name="Player", property="collision_layer")  # 复核
```

### 添加 UI 分数标签

```
Step 1: scenes(action="info", scene_path="scenes/main_ui.tscn")
Step 2: ui(action="create_control", scene_path="scenes/main_ui.tscn", name="ScoreLabel", type="Label", parent=".")
Step 3: nodes(action="set_property", scene_path="scenes/main_ui.tscn", name="ScoreLabel", property="text", value="Score: 0")
Step 4: nodes(action="set_property", scene_path="scenes/main_ui.tscn", name="ScoreLabel", property="theme_override_font_sizes/font_size", value="24")
Step 5: scenes(action="info", scene_path="scenes/main_ui.tscn")  # 复核
```
