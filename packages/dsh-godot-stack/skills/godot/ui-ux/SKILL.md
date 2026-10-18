---
name: ui-ux
description: Godot UI 与界面专家。覆盖 Control 节点布局（ui.* 工具）、响应式布局、主题、无窗几何断言、商业化 UI 基准。当创建/修改 UI 界面、HUD、菜单、商店、设置页时加载本技能。
---

# UI 与界面（ui-ux）

## UI 工具（ui.*）

| action | 说明 |
|--------|------|
| create_control | 创建控件（scene_path + name + type + parent） |
| set_theme | 设置主题 |
| layout | 布局调整 |
| list_controls | 列出控件树 |

## 布局规范

- 用容器（HBoxContainer / VBoxContainer / GridContainer / MarginContainer / CenterContainer）做响应式布局，**不用绝对坐标堆 UI**
- Control 节点的锚点（anchors）决定随窗口缩放的行为：全屏用 full rect，底部菜单用 bottom wide
- 字号/边距等覆盖用 `theme_override_*` 属性（如 `theme_override_font_sizes/font_size`）

## 无窗几何断言（画面验收，不是每次改 UI 的默认步骤）

- 文案、字号、单个控件：`scenes.info` 复核后停。不要自动跑游戏或像素对比
- 用户要验收画面时再做视觉验证：截图（vision_html_screenshot 或用户提供游戏截图）→ `vision_pixel_diff` 与设计稿/改动前对比 → 差异率 > 5% 时用 `vision_crop` 裁剪放大定位最差区域 → 修正 → 再验证

## 商业化 UI 基准

- 首屏 30 秒能懂：核心操作按钮大而明确、反馈即时
- 商店/付费 UI：价格清晰、购买按钮明确、防误触（确认弹窗）
- 留存钩子：任务/奖励入口在 UI 上显眼

## 实操示例

```
Step 1: scenes(action="info", scene_path="scenes/main_ui.tscn")        # 看当前 UI 结构
Step 2: ui(action="create_control", scene_path="scenes/main_ui.tscn", name="ScoreLabel", type="Label", parent=".")
Step 3: nodes(action="set_property", scene_path="scenes/main_ui.tscn", name="ScoreLabel", property="text", value="Score: 0")
Step 4: nodes(action="set_property", scene_path="scenes/main_ui.tscn", name="ScoreLabel", property="theme_override_font_sizes/font_size", value="24")
Step 5: scenes(action="info", scene_path="scenes/main_ui.tscn")        # 复核
```
