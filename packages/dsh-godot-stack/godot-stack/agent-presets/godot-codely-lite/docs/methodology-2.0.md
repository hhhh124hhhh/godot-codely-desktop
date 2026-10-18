# 方法论 2.0（按需加载）

路径相对于 `godot-codely-lite` 预设目录：仓库里是
`packages/dsh-godot-stack/godot-stack/agent-presets/godot-codely-lite/`，
启动复制后是 `<dshHome>/.agent-presets/godot-codely-lite/`。
单人 Codely 的每轮提示词不包含本文。需要阶段规划、上架判断或质量边界时再读。

同目录还有 `loop-examples.md`（工具长示例）、`zfoo-framework.md`（框架表）。
Game Studio / 多 Agent 的角色拆分在 `team-routing.md`。单人 Codely **不要**先走五人团再动手。

## 分层验证

按改动声称的完成度选一档，不要逐档升级：

| 改动 | 一次具体检查 | 不要自动做 |
| --- | --- | --- |
| 结构 / 编辑器（节点、属性、脚本文本） | `scenes.info`，脚本用 `scripts.read` | `project.run`、冒烟、功能自测 |
| 必须引擎才知道对不对的行为 | 一次 `project.run` | 冒烟闸、功能自测闸、再查一遍环境 |
| 宣称可交付，或 Phase 3 | 完整三道闸（见下） | 用其中一闸代替三闸 |

小改动停在对应那一档。失败时定位到文件/行，只补那一处，再停。不重写整份脚本，不反复 `config status`。

### 三道闸（仅可交付 / Phase 3）

1. **编译闸** — `godot-verify`，`--boot-scene` 全量 load。不用 `--script` / `--check-only`。
2. **冒烟闸** — `godot-runtime-smoke`，headless 跑起来。
3. **功能闸** — `godot-functional-playtest` 自测本次任务的具体断言。退出码 0 不等于玩法正确。

闸绿才可以宣称「可交付 / 完成」。日常小改不跑这三闸。导出用 `project.export`（需 `GODOT_PATH`）。

已有编辑器时：`editor.launch` / `editor.scan` / `editor.play` / `editor.live_status` / `editor.stop`。
有未保存场景就报告并等用户处理，不自动覆盖。Play 只说明命令已派出，还要再查实际状态。

## Loop Engineering

闭环是「读场景 → 决定改什么 → 改场景/脚本 → 一次检查 → 看真实报错 → 只修那一处」。
`godot-mcp-server` 直接改 `.tscn` / `.gd`，不需要编辑器常驻。
只有 `project.run` / `project.export` / `editor.launch` 依赖 `GODOT_PATH`。

不能碰引擎内存对象（没有 `get_node` 句柄）。不确定工具参数先 `mcp__godot__help`。

## 不灰盒与四轴

- **不灰盒**：第一个交付物是能玩的核心循环（占位美术 + 合成音效 + 手感三件套），然后再打磨。从「能不能上架、能不能卖」倒推，而不是先做灰盒占位。
- **核心动词先行**：一句话钉死核心动词（例如「熄灯摸金」= 摸 / 收 / 逃）。选择→后果链成立才算核心循环。
- **AI 不能判断好玩**：好玩靠人验。代理只把可玩基线做出来，把反馈做准。

每次迭代按四轴倒推：

- **体验**：核心循环手感、反馈、可读性
- **产品**：定位、首屏 30 秒能懂、留存钩子
- **商业**：付费/广告/买断不破坏体验
- **技术**：性能、可维护性、跨平台导出；三道闸只在宣称可交付或 Phase 3 时全跑

## 阶段门控

- **Phase 0 脚手架**：核心动词、技术栈（以工程实际 Godot 版本为准）、四轴进度，落 `PROJECT.md`
- **Phase 1 核心循环**：场景树 + 脚本骨架 + 信号/Resource 解耦，产出能玩的核心循环
- **Phase 2 内容与质感**：TileMap / 程序化关卡 / 着色器、物理 / 动画 / 音频、UI 与商业化基准
- **Phase 3 三道闸与发布**：编译闸 → headless 冒烟 → 功能自测 → 导出打包

未完成前一阶段不跳下一阶段。Phase 1/2 的日常编辑仍用分层验证，不因为「在做游戏」就自动跑三道闸。

## 技能路由（按任务加载，不要一次读完）

| 任务触发 | 技能 |
| --- | --- |
| 新建/改场景、节点、信号、输入映射 | scene-tree |
| 写/改 GDScript、用框架 API | gdscript |
| 角色移动、物理、碰撞、动画状态机 | physics-movement |
| UI 界面、布局、主题、商业化 UI | ui-ux |
| 着色器、TileMap、程序化关卡、地形 | shader-worldgen |
| 验证、三道闸、视觉对比、导出 | quality-gates |
| 选工程、阶段规划、PROJECT.md | project-workflow |
| 不明确 | 先加载索引 `skills/godot/SKILL.md` 再路由 |

## 红线

- 不改写已经能玩的底层循环去「加功能」导致断裂
- 不在没有 `scenes.info` / `nodes.list` / `scripts.read` 的情况下批量重写节点或脚本
- 不跳过三道闸就宣称可交付或 Phase 3 完成
- 不把小改动自动升级成冒烟或功能自测
