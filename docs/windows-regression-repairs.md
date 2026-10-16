# Windows 回归修复（2026-10-16）

本批以 `codex/godot-engine-controls` 为基线，处理此前全量回归中的图片写入、构建审批、路径链接与 HOME 测试失败。没有重置真实 Profile 或修改系统 Developer Mode。

## 图片写入：实际运行时缺陷

`writerEnvironment()` 为避免泄露凭据和 `NODE_OPTIONS` 清除了父环境，但 Windows ACL runner 在切换到私有临时目录前，需要通过 `GetTempPathW()` 找到宿主临时目录来建立 ACL 锁。丢弃 TEMP/TMP 后实际尝试创建 `C:\Windows\dsh-acl-locks`，以 EPERM 退出 127。

另一个触发条件是 Windows worker 的 `process.env` JS 对象区分键大小写。固定读取 `SystemRoot` 可能漏掉 `SYSTEMROOT`，子进程 Node 以 134 退出并报告 `ncrypto::CSPRNG(nullptr, 0)` 断言失败。

修复仅放行 Windows 的 SYSTEMROOT、TEMP、TMP，按大小写无关的白名单匹配并保留原始键名。其他父环境键仍以 tombstone 清除，Electron 的 Node 模式继续显式设置。ACL runner 仍负责为受限写入进程切换私有临时目录，没有放宽文件系统沙箱。

## 测试修复

- pnpm 构建审批：把含空格的 Node 绝对路径嵌入生命周期命令，经过 Windows `cmd /c` 后被拆成 `C:\Program`。fixture 现在使用 `node build.cjs`，在子进程 PATH 首位固定当前 Node 目录，并在构建脚本内断言 `process.execPath` 等于当前测试解释器。未批准拒绝、批准后产物、最低发布时间限制仍走真实 pnpm。
- 目录链接：Windows 明确使用 junction，其他平台使用目录 symlink。实际覆盖本地插件宿主 peer fallback、market baseline 拒绝 generation 链接、个人模板路径逃逸、图片父目录逃逸和依赖入口逃逸。
- 文件符号链接：单独探测本机能力。仅缺少权限/不支持时，3 个明确命名的文件 symlink 用例标为跳过，独立报告；并发写入、损坏图片、改动预览文件及目录逃逸检查仍执行。具备能力的主机继续执行全部文件链接断言，不能把本机跳过写成通过。
- HOME：在真实子进程中设置 HOME/USERPROFILE 并验证记忆目录迁移，避免 worker-local 环境变化与 `os.homedir()` 读取的本机进程环境不一致。保留共享记忆不覆盖、忽略 Desktop DSH_HOME 及 token 路径断言。

## 验证

- 严格类型检查通过。
- 原失败的 7 个套件在 threads 池：145 通过、3 跳过；包括真实两个图片适配器的本地 provider 回路、实际 ACL 沙箱图片写入与 pnpm 构建审批。
- 真实 Electron Node 宿主 + Windows ACL runner 写入测试 PNG：退出 0，得到 workspace 内生成文件路径及 SHA-256，stderr 为空；没有调用付费图片服务。该验证使用临时工作区，不等于正式安装包验收。

- 完整 `npm run build` 通过。
- 完整 `npm test -- --maxWorkers=2`：191 套件通过、6 套件跳过；1689 项通过、14 项跳过，**0 失败**，无 worker 异常。其中 3 项是本批明确分离的文件 symlink 权限用例，不能计为通过；其余跳过沿用现有环境条件。
- JS 语法与 `git diff --check` 通过。没有修改依赖或锁文件，没有声称 lint/format 检查通过。

Godot/MSIX 目录崩溃的已完成环境修复见 [引擎控制验收记录](godot-desktop-engine-controls.md)。正式安装包及其他平台未在本批重新验收。

## 远端 CI 的路径失配

GitHub Windows runner 的 TEMP 含 `RUNNER~1` 短路径。编辑器心跳和工作区元数据可能使用同一目录的不同拼写；原 EditorControl 只做 resolve/小写转换，无法匹配短路径、长路径和 junction，因而把已连接编辑器判为离线。桥接层现在先取得现有目录的物理路径，再应用平台大小写规则；命令仍由注册工作区选定，不接受请求体里的项目路径。目录别名回归同时验证另一个 editorId 不能借别名绕过项目租约。

重启认证测试使用规范化的临时根目录，与 Harness 返回的规范目录契约一致。真实编辑器测试在布局加载后等待新鲜心跳，避免把启动期间的过期租约当作就绪。Godot CI 增加工作区 API 套件，直接覆盖之前 Windows 构建中的命令分派失败。

Windows 专项 4 套件 10 项通过，包含真实 Godot Play/Stop 与两次 Harness 启动；新鲜心跳等待再次真实复验通过。最终类型检查、完整构建及 `npm test -- --maxWorkers=2` 通过：1690 项通过、14 跳过、0 失败，无 worker 异常。远端 CI 的当前 head 结果及安装包验收以对应 PR 检查为准，不能用本地结果替代。
