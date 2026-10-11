---
name: physics-movement
description: Godot 物理与角色移动专家。覆盖物理工具（physics.*）、角色手感（CharacterBody2D、跳跃、加速度）、碰撞层与掩码、动画状态机、多人。当处理角色控制、移动手感、碰撞、状态机、多人同步时加载本技能。
---

# 物理、手感与动画状态机（physics-movement）

## 物理工具（physics.*）

| action | 说明 |
|--------|------|
| layers | 查看/设置碰撞层与掩码 |
| collision_setup | 碰撞体配置 |
| body_config | 刚体/角色体配置（collision_layer / collision_mask） |
| set_layer_name | 给碰撞层命名 |

## 角色手感三件套

- **移动**：`CharacterBody2D` + `Input.get_vector(...)` + `velocity * SPEED` + `move_and_slide()`
- **跳跃**：`Input.is_action_just_pressed("jump")` + `velocity.y = -JUMP_VELOCITY`，注意按物理帧处理
- **手感调优**：加速度/减速度（`lerp`）、重力系数、土狼时间（coyote time）、跳跃缓冲（jump buffer）——先做能玩的基线，再调"手感"

## 碰撞层与掩码

- 层（layer）= 物体属于谁；掩码（mask）= 物体与谁碰撞
- 示例：玩家层 1（layer=1），敌人层 2（layer=2）；玩家 mask=2（只撞敌人），敌人 mask=1

## 动画状态机

- 用 `animation` 工具（create_player / add_animation / add_track / add_keyframe）
- 状态机：idle / run / jump / fall，用条件（velocity、is_on_floor）切换，避免 if 堆成面条

## 多人（可选）

- 涉及多人时加载：RPC、Spawner、网络同步（Godot 4 的 MultiplayerSynchronizer / SceneReplication）
- 单人原型阶段不要过早引入多人复杂度，先把核心循环钉死

## 红线

- 不改写已验证可玩的底层核心循环去"加功能"导致断裂
- 手感改动必须跑起来实机验证（project.run），AI 不能判断"好玩"，只把可玩基线拉满、把反馈做准
