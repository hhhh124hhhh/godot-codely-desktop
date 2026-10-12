---
name: godot-memory
description: Godot Codely 长期记忆读写与备份。当用户需要你记住偏好/项目事实/决策/约定，或需要回顾之前记住的内容时使用。记忆以 Markdown 文件持久化在 ~/.dsh/memories/<topic>.md（跨会话、CLI 与桌面端共享）。
---

# Godot Codely 长期记忆（godot-memory）

## 快速开始

**自动模式（默认）**：每次任务完成后，自动评估本轮是否出现值得长期记住的信息（用户偏好/产品决策/架构约定/踩坑结论/新能力状态）。如有，直接用 `write` 写入 `~/.dsh/memories/<topic>.md`——**不需要用户要求，不需要询问**。

**按需模式**：用户说"记住/别忘了/以后都…"时，或你发现稳定、跨会话可复用的偏好/事实时，同样立即写入。

**回顾模式**：用户问"之前说过/还记得…"时，用 `read`/`glob` 读取对应文件并引用原文。

## 存储约定

- 根目录：`~/.dsh/memories/`（不存在则用 `write` 自动创建）
- 文件名：`<topic>.md`，topic 仅限字母/数字/_-.和中文，禁路径分隔符
- 单文件上限：200KB（超出截断前先询问用户）
- 同 topic 再次写入 = 覆盖（UPSERT）；不同事实拆不同文件

## 备份机制（对标 cowork memory\backup）

- **写前自动备份**：覆盖已有记忆文件前，把当前版本复制为 `~/.dsh/memories/.backup/<topic>.md.<YYYYMMDD-HHmmss>`（写文件失败不阻断主操作，仅记录）。
- **批量备份**：每周或用户要求时，把 `~/.dsh/memories/*.md` 整体复制到 `.backup/`（保留日期戳）。
- **恢复**：记忆文件损坏/误删时，从 `.backup/` 取最近版本恢复，并标注恢复时间。
- 备份是**追加保留**（不删除旧备份），直到用户明确清理。

## 操作示例

```text
记住用户偏好：write 到 ~/.dsh/memories/user_preferences.md，
内容如「用户偏好简体中文；生成 3D 模型不用高精度/四边形拓扑；重要节点推飞书」

回忆上次结论：read ~/.dsh/memories/godot_conventions.md，
引用原文并说明记忆时间（无时间戳则以文件 mtime 为准）

盘点全部记忆：用 glob 列出 ~/.dsh/memories/*.md，逐个 read
```

## 与 AGENTS.md 的关系

- `~/.dsh/AGENTS.md` 和项目 `AGENTS.md` 是**静态**工作区指令（dsh-agent-instructions 注入）
- `~/.dsh/memories/` 是**动态**长期记忆（本 skill 管理，agent 主动读写）
- 两者互补：静态放规范与约束，动态放事实与偏好；冲突时以最近的动态记忆为准
