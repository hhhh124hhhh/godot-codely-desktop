# Godot 技能库（SKILL.md 体系）

> 对标 Tuanjie Codely 的 `~/.codely-cli/skills/` 技能库模式：**瘦主提示词 + 按需加载技能**。
> 把原来一次性注入的 15KB SYSTEM_PROMPT.md 拆成可按需加载的领域技能，每次会话省 token 50-70%，且技能可跨项目复用、可单独迭代。

## 结构

```
skills/godot/
├── SKILL.md                # 索引 + 路由规则 + 23 工具总览
├── scene-tree/             # .tscn 格式、节点树、信号、输入映射
├── gdscript/               # GDScript 规范 + zfoo 框架 API（禁止手写表）
├── physics-movement/       # 物理、手感、动画状态机
├── ui-ux/                  # Control 布局、商业化 UI
├── shader-worldgen/        # 着色器、TileMap、程序化关卡
├── quality-gates/          # 三道闸 + 视觉验证 + 导出发布
└── project-workflow/       # 工程自选、阶段门控、方法论 2.0 细则、四轴
```

## 路由规则（主提示词如何用）

| 任务触发 | 加载技能 |
|---|---|
| 新建/改场景、节点、信号、输入映射 | `scene-tree` |
| 写/改 GDScript、用框架 API | `gdscript` |
| 角色移动、物理、碰撞、动画状态机 | `physics-movement` |
| UI 界面、布局、主题、商业化 UI | `ui-ux` |
| 着色器、TileMap、程序化关卡、地形 | `shader-worldgen` |
| 验证、三道闸、视觉对比、导出 | `quality-gates` |
| 选工程、阶段规划、PROJECT.md、方法论 | `project-workflow` |
| 不明确 | 先加载 `SKILL.md` 索引再路由 |

## 与 agent-presets 的关系

- `agent-presets/godot-codely-lite/` = 瘦身主提示词预设，按上面路由规则激活技能
- 原 `agent-presets/godot-codely/` = 完整一次性注入版（保留作对照，可随时切回）
- 技能文件是**纯知识**，不绑定预设：任何预设/项目都能引用
