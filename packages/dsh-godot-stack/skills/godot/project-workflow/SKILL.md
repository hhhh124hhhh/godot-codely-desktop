---
name: project-workflow
description: Godot 工程流程专家。覆盖工程自选（config/list_projects/project_path 切换）、阶段门控（Phase 0-3）、方法论 2.0 细则（不灰盒/核心动词/四轴上架迭代）、PROJECT.md 落地。当选择工程、规划迭代、制定阶段、维护 PROJECT.md 时加载本技能。
---

# 工程流程与方法论（project-workflow）

## 工程自选（会话开场必做）

1. **先确认当前指向**：`config(action="status")` 看 `project_path`（server 启动时默认 = 进程 cwd，可能不是目标工程）
2. **按工作目录扫描**：`list_projects(directory=当前工作目录, recursive=true)` 拿工程列表（含路径 + 名称）
3. **匹配并切换**：挑出与用户意图匹配的工程，`config(action="set", key="project_path", value=工程路径)` 运行时切换（验证 project.godot 存在，全局立即生效，可来回切）
4. **确认**：再 `config status` 复核已指向目标工程，再开始读写场景

- 切换是**会话内有效**（不改 patch、不重启 server）；用户中途说"换到另一个工程"时重复上述步骤
- 若用户给了明确工程路径，直接 `config set` 切过去，不必扫描

## 方法论 2.0（不可违背）

- **不灰盒**：第一个交付物就是「能玩的核心循环游戏」（占位美术 + 合成音效 + 手感三件套），之后再打磨/扩充/迭代。从 t=0 按「能不能上架、能不能卖」倒推
- **核心动词先行**：先用一句话钉死核心动词（如「熄灯摸金」= 摸 / 收 / 逃），选择→后果链成立才算核心循环
- **AI 不能判断好玩**：好玩靠人来验，你只负责把可玩基线拉满、把反馈做准

## 四轴上架迭代（每次迭代项都按四轴倒推）

- **体验轴**：核心循环手感、反馈（juice）、可读性
- **产品轴**：定位清晰、首屏 30 秒能懂、留存钩子
- **商业轴**：付费/广告/买断点的可行性与不破坏体验
- **技术轴**：性能、三道闸、可维护性、跨平台导出

## 阶段门控（SOP：从想法到上架）

- **Phase 0 脚手架**：钉死核心动词、技术栈（Godot 4.7.1 stable，非 mono）、四轴进度；落 `PROJECT.md`
- **Phase 1 核心循环**：场景树 + 脚本骨架 + 信号/Resource 解耦，产出能玩的核心循环
- **Phase 2 内容与质感**：TileMap/程序化关卡/地形/着色器、物理/动画/音频、UI 与商业化基准
- **Phase 3 三道闸与发布**：编译闸 → headless 冒烟 → 功能自测 → 导出打包。完整三道闸只在这一阶段或用户宣称可交付时跑

## 多人工作室路由

单人 Godot Codely 不要先做五人团再动手。Game Studio / 多 Agent 的角色拆分在预设目录 `docs/team-routing.md`（相对 `godot-codely-lite`）。

## 红线（防死火）

- 不改写已验证可玩的底层核心循环去「加功能」导致断裂
- 小改动用 `scenes.info` / `scripts.read` 停住；不要自动跑冒烟或功能自测
- 只有宣称可交付或 Phase 3 才要求三道闸全绿
- 不在没有 `scenes.info` / `nodes.list` / `scripts.read` 的情况下批量重写节点 / 脚本
