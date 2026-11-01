---
name: quality-gates
description: Godot 质量闸与发布专家。覆盖三道闸红线（编译闸 godot-verify 全量 load / 冒烟闸 headless 运行 / 功能自测）、视觉验证闭环、导出发布（project.export）。当验证完成度、发布、截图对比、性能检查时加载本技能。
---

# 三道闸与发布（quality-gates）

## 三道闸红线（闸绿才算完成，AI 不会糊弄你）

1. **编译闸** — `godot-verify` 全量 load（`--boot-scene`），**绝不用 `--script` / `--check-only`**
2. **冒烟闸** — `godot-runtime-smoke` headless 运行
3. **功能闸** — `godot-functional-playtest` 自测

- 三道闸全部通过才算"完成"；不跳过闸直接宣称"完成"是红线
- 验证工具：godot-verify / godot-runtime-smoke / godot-functional-playtest / godot-export

## 验收裁决红线（证据验收职责）

- **无证据不宣称完成**：UI / 画面相关改动没有「运行 + 截图 + 对比」证据链时，只能说「已实现，待验收」，不能说「完成」。
- **闸红不降口径**：任何一道闸红时，禁止把 `--boot-scene` 降级成 `--script` / `--check-only`、或跳过冒烟凑绿；修到真绿为止，修不了就如实报告红闸位置。
- **体验结论交人**：手感 / 好不好玩 / 首屏 30 秒是否成立，你只能给证据（截图、帧率、对比数据）和选项，最终结论交还用户体验后裁定。
- **验收话术**：收尾时区分「已验证」（有证据）与「待验收」（未验证），不把两者混在一句「完成了」里。

## 视觉验证闭环（UI/画面相关改动必做）

```
改代码 → 运行 → 截图 → 像素对比 → 差异 > 5% → 定位修复 → 再验证
```

配合 dsh-vision-toolkit：
- `vision_html_screenshot`：截当前 HTML 页面（需 Chrome）
- `vision_pixel_diff`：两张图逐像素对比，输出差异率 + 热力图
- `vision_describe`：看图问答，可输出结构化 JSON
- `vision_crop`：按像素框裁剪放大
- `vision_ocr`：文字转写
- `vision_colors`：提取主色

## 导出发布（project.*）

- `project(action="export")`：导出构建（需 GODOT_PATH）
- `project(action="run")` / `project(action="stop")`：运行/停止
- 性能检查：涉及性能时用 UPR 风格的分析（帧率、内存），性能问题先定位热点再优化

## 阶段门控（发布前必须过完）

- Phase 0 脚手架（落 PROJECT.md）→ Phase 1 核心循环 → Phase 2 内容质感 → Phase 3 三道闸发布
- 未完成前序阶段不跳后续
