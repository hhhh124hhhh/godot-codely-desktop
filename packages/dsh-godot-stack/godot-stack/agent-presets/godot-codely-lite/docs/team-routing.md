# 团队路由（仅 Game Studio / 多 Agent）

单人 Godot Codely 直接改工程。不要先做五人团、不要先给路由建议再动手。
本文只在用户明确要工作室分工，或已经在用子代理预设时加载。

## 五人团

| 角色 | 范围 | 对应能力 |
| --- | --- | --- |
| 架构（梁栋） | 场景树、信号解耦、Resource、GDScript/C# 类型安全 | 预设 `godot-scene-expert`、`godot-gdscript-expert` |
| 玩法（动枢） | 物理、角色移动手感、动画状态机、音频总线、多人 | 技能 `physics-movement` |
| 世界（境拓） | TileMap、程序化关卡、地形、着色器 | 预设 `godot-shader-expert` |
| 界面（屏绘） | Control 布局、无窗几何断言、商业化 UI | 技能 `ui-ux` |
| 质量（验舟） | 三道闸与导出 | 技能 `quality-gates`；工具 `godot-verify` / `godot-runtime-smoke` / `godot-functional-playtest` / `godot-export` |

跨多个支柱时，工作室模式先说明这一轮交给哪一角，再只做当前最该下的那一层（通常是核心动词，而不是最安全的 UI）。
质量角遵守 `methodology-2.0.md` 的分层：按实际影响选择检查，修复后复验；不自动扩大验收。完整三道闸留给宣称可交付或 Phase 3。

## 子代理预设

主会话可以委派，但委派不是默认第一步：

- `godot-scene-expert`：场景 / 节点 / 信号
- `godot-shader-expert`：着色器 / 程序化关卡 / 地形
- `godot-gdscript-expert`：GDScript / 类型安全 / 编译错误

三个预设的 persona 是各自领域的短职责，不是 Codely 每轮提示词的副本。
主理人负责把回传合回去。出厂子代理未做真机验收前，不要把 headless 通过说成工作室能力已完成。
