# 豆包工作任务清单

依据：2026-10-13 Cowork 差距检查。以下任务可独立交付；本清单不是已完成状态，也不表示已向豆包发送消息。

## 分工边界

Codex 负责 Godot MCP 构建与安装闭包、面板接入 Harness、Bridge 会话和事件协议、实时编辑器上下文与操控、OCU/Codex 子进程稳定性，以及整体验收。记忆读写越界及备份修复也由 Codex 负责，避免三个入口各自实现。

豆包任务默认不修改根 package.json / package-lock.json、构建脚本、index.js、panel.gd、plugin.gd、bridge/、ocu-gateway/ 和 MCP 服务代码。需要这些入口配合时，提交接口需求及测试证据，由 Codex 集成。不要修改真实用户 Profile、凭据或已安装插件。

## 可直接执行的任务

| 编号 | 任务与文件范围 | 验收标准 |
| --- | --- | --- |
| D1 | 修复 `packages/dsh-godot-stack/godot-stack/agent-presets/godot-codely-lite`：恢复为目录，含 preset.yml 与 agent.cordis.yml；参考原始 Godot 资源，但逐项去掉机器路径、凭据及个人模型配置 | 在全新临时目录中能解析元数据和完整 Agent 配置；没有用户 home、盘符或密钥硬编码；说明依赖的插件及服务，明确配置 dsh-mcp-client，不能把 settings.json 写入当成 Harness 激活。MCP 路径与 Node 启动参数由 Codex 集成；交给 Codex 验证 provisioning 与真实 Harness 加载 |
| D2 | 整理 `packages/dsh-godot-stack/skills/`：明确索引技能与七个领域技能的发现方式，修复失效资源链接 | 每项技能 ID 唯一、描述说明触发条件；资源路径都存在；给出 filesystem provider 的实际发现结果。roots 接入需求提交给 Codex，不修改全局用户目录 |
| D3 | 新增可分发的 scene / shader / gdscript 专家配置，放入上述完整预设；不从真实用户 Profile 整段复制 | 三项明确任务范围、工具限制和失败出口；沿用父级模型或现有模型配置，不绑定个人套餐；YAML 可解析，无新运行时依赖；由 Codex 验证专家调用与完成事件 |
| D4 | 修正 Godot 包 README 与 AGENTS.md 的事实记录 | 区分已实现、已加载、已验收；去掉过期的 LSP“未做”与错误启动命令；子代理出厂能力未验收前不能勾选完成；token 节省比例没有测量就撤掉；命令对应当前 package.json |
| D5 | 给现有 generate_image / generate_sprite / text_to_speech 编写操作示例及排错说明，放在技能资源和 README | 说明参数、输出资源导入流程、缺凭据及失败表现；示例不调用付费 API、不包含密钥；不宣称已支持 3D、骨骼动画、音乐或音效生成 |
| D6 | 整理面板文案与状态设计，输出 `docs/godot-panel-states.md`，先不修改面板源码 | 覆盖连接中、Harness 未启动、认证失效、工具执行、等待审批、取消中、断线可恢复、失败；每个状态说明触发条件、用户动作和保留数据；由 Codex 落实到面板协议 |

## 提交要求

按 D1–D6 分开提交或给出独立 diff；写明实际运行的检查和未完成验收。保留其他人的 WIP；不要把仅存在文件、HTTP 200 或模拟响应写成真实应用成功。优先完成 D1、D2、D3，再处理文档任务。

## Codex 实施顺序

1. 干净安装闭包：根构建生成独立 MCP 运行时，缺产物时拒绝报告 configured，隔离 home 实际 initialize / tools/list / tools/call。
2. 面板统一使用 Harness：会话、事件、工具、审批、取消与恢复，保留原始失败证据。
3. 编辑器桥接：实时场景/选择/未保存状态，再补操作和撤销；以实际 Godot 验收。
4. 委派与 OCU：Windows 参数、stdin EOF、超时、退出及子进程清理；区分工具发现和真实动作验收。

工程引用索引、完整 LSP 语义和运行视觉验证仍是后续能力项，不列为豆包的简单任务，也不随本清单声称完成。

共享源码新增 `033c16c` 的面板工具循环；它补齐了直连 LLM 的工具调用，尚不等于 Harness 审批、取消和会话恢复集成。不要重复补一套工具循环。
