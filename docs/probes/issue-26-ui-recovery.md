# #26 桌面聊天、错误与草稿恢复验收

2026-10-16（Asia/Shanghai）。本轮新增的 D2/D4/D5 局部行为通过：真实原生 Lite 会话的模型缺配置错误可见，中英文切换、深浅主题与两种窗口宽度保留草稿；关闭 renderer、停止并重新启动 Harness 后，同一项目/会话的用户消息、失败记录和未发送草稿恢复。

**整体仍为 WAIT_EVIDENCE**。本轮是开发运行方式，未替代同一安装包的完整用户流程、人工易用性评价或 R1 强制治理边界。

## 来源与复现

- HEAD：`ba47931c3e7d4b058d150d68ce65b2a35a07e6d7`；新增验收源码尚未提交。
- Windows / Electron `43.0.0` / Harness `0.2.0-rc.2`。使用现有开发 preload，未为本轮重建完整应用。
- `node scripts/probes/godot-agent-desktop.mjs --ui-only`；运行前不需要模型密钥或 Godot 可执行文件。
- 新建临时 userData、DSH_HOME、含中文长目录名的 Godot fixture；模型路由指向 loopback 且缺少凭据，不调用真实外部模型，不改用户 Profile，不操作其他窗口的更新工作。
- 使用实际 `DesktopStorageManager` 与 preload storage IPC，未伪造恢复结果；原生项目树和会话行通过实际 click 打开，输入通过 Electron `insertText`，Tab 通过原生输入事件。

成功证据目录：`.build/godot-agent-desktop/run-if5dEH/`。

## 实际结果

| 检查 | 证据与结论 |
| --- | --- |
| 模型未配置 | 真 session/prompt 返回真实 turn error，原生聊天显示 `MISSING_CREDENTIAL` 及缺少的凭据引用；未显示成功 |
| 原生会话身份 | UI 显示 Godot Codely Lite、测试项目与会话标题；重开后的 sessionId/workspaceId 与重开前相同 |
| 窗口尺寸 | 外窗请求 1280×800、900×800；四张中文深浅主题截图对应 renderer 为 1264×735、884×735；文档 scrollWidth 等于视口宽，无文档级横向溢出 |
| 深浅主题 | 系统主题请求实际生效，body 背景分别为 `rgb(19, 28, 44)` 与 `rgb(238, 242, 248)`；已查看深色及浅色截图 |
| 中英文 | 设置 namespace `locale` 更新到 en 后，实际显示 Chat、This turn failed、Workspace Write；已查看英文截图 |
| 输入与键盘 | 未发送草稿在尺寸、主题、语言切换后保持；Tab 从输入区转移到 Add files or run commands 按钮，未发送消息 |
| 恢复 | 关闭真实 BrowserWindow、flush 本地存储、停止 Harness 子进程，重新启动并创建新窗口；原用户消息与 turn/end 逐项相同，草稿恢复，英文偏好也恢复 |
| 清理 | runner 退出后删除本轮临时 Profile 和测试工程，生成证据保留在 .build 下 |

重开截图 renderer 为 1264×655，单独记录实际尺寸，不把它冒称为 1280×800 内容区截图。Electron main 未重启，因此只证明窗口/renderer 和 Harness 子进程恢复，不证明整应用退出后的全部生命周期。

模型失败提示仍包含英文底层诊断和凭据引用，没有密钥值；本轮确认错误真实可见，不把它判为面向普通用户的最佳提示文案。

## 证据完整性与检查

| 文件 | SHA-256 |
| --- | --- |
| result.json | `46f0cc3be2d057450fae09316dbbf4fea9489588166dff371373ccd86e1b5e41` |
| journal.json | `e6fbb1897e2f4c1f6bfcacc688618a28cfca8273160e07f9b79a436a374c33da` |
| reopened.png | `068d0ebb2195fa4303d7b0c4a5ef6c41d0cf123ca4a750d3b1180d271a7b2d70` |

runner JS 语法、两个探针 TS 的单独 strict/noUncheckedIndexedAccess 类型检查及 `git diff --check` 通过；未运行全量回归或完整 build。

保留两份先前证据，不混用：`run-73BiFf` 是中文尺寸/恢复子集通过；`run-c4FDzI` 英文切换已生效，但探针错误等待不存在的英文文案导致失败。修正为锁定版本实际文案 `This turn failed` 后，全新夹具重跑得到上述通过结果。产品代码未修改。

尚未覆盖：工作台切换时保留输入、多项目同时操作、所有错误矩阵、长日志交互、完整安装版相同流程、真人易用性/玩法判断。英文截图只覆盖浅色窄窗，不能称完整语言×主题×尺寸组合全覆盖。

## 远程发布核对：0.1.4

本轮同时只读核对其他窗口推进的发布结果，未改动更新代码或发起发布：

- [安装包流水线 38920714355](https://github.com/hhhh124hhhh/godot-codely-desktop/actions/runs/38920714355) 最终 `completed/success`。Windows x64、Linux x64、macOS ARM/Intel、Windows installer and client UI、Publish unsigned GitHub Release 均成功；签名分支被跳过，不宣称有签名。
- [v0.1.4-unsigned](https://github.com/hhhh124hhhh/godot-codely-desktop/releases/tag/v0.1.4-unsigned) 于北京时间 2026-10-16 23:20:32 发布，为 GitHub Pre-release。发布说明绑定 `ba47931c3e7d4b058d150d68ce65b2a35a07e6d7`。
- 远程资产包含 Windows setup、blockmap、latest.yml 和 SHA256SUMS.txt。实际读取 latest.yml：`version=0.1.4`，`path=godot-codely-windows-x64-setup.exe`，`size=255160309`，与 Release 安装包元数据一致。
- GitHub 报告 Windows 安装包 SHA-256 为 `8a6f69dafcd29890bee6f98057774f9ca76f8f39d06c22373bb1f464aed86f49`；本轮未下载完整安装包重新计算，不冒称已本地验证下载哈希。
- 可以确认远程构建、安装/UI 工作流与发布成功。尚未实测本机旧版本的发现更新、下载、重启升级及升级后用户数据恢复；也不能把本轮开发 UI 或前轮模型证据写成“在同一正式安装包内完成”。
