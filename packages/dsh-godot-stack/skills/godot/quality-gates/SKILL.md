---
name: quality-gates
description: Godot 质量闸与发布专家。覆盖三道闸红线（编译闸 godot-verify 全量 load / 冒烟闸 headless 运行 / 功能自测）、视觉验证闭环、导出发布（project.export）。当验证完成度、发布、截图对比、性能检查时加载本技能。
---

# 三道闸与发布（quality-gates）

## 分层验证（先看完这一节）

- 结构 / 编辑器改动：`scenes.info`（脚本用 `scripts.read`）一次即可
- 必须引擎才知道对不对的行为：一次 `project.run`
- 宣称可交付，或 Phase 3：才跑下面的完整三道闸
- 小改动不要自动升级到冒烟闸或功能自测

细则与阶段门控见预设目录 `docs/methodology-2.0.md`。

## 三道闸红线（仅可交付 / Phase 3；闸绿才算这一档完成）

1. **编译闸** — `godot-verify` 全量 load（`--boot-scene`），**绝不用 `--script` / `--check-only`**
2. **冒烟闸** — `godot-runtime-smoke` headless 运行
3. **功能闸** — `godot-functional-playtest` 自测

- 三道闸全部通过才可以宣称可交付或 Phase 3 完成。日常小改不跑这三闸，也不要跳过三闸就宣称可交付
- 验证工具：godot-verify / godot-runtime-smoke / godot-functional-playtest / godot-export

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
