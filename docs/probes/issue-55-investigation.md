# #55 Windows 空格路径安装调查

更新：2026-10-19。已定位并修复可复现的 staging 权限失败静默退出；空格路径本身不是该失败的条件。修复尚未发布。

## 已有证据

- Kimi Code 本地实验：7za 直接解压到含空格路径成功；微型 NSIS 脚本复刻 `nsExec::ExecToStack` 与 `dshExtractPayload` 的命令行，退出码 0，解出 7,301 个文件。
- Kimi 发现旧 `dist` 二进制与预期提交不一致；旧包在无空格路径也失败。不能把这些实验归入“已合并 #54 的安装器回归”。
- Kimi 重新生成的完整安装器（2026-10-18 23:41，SHA-256 `3de26b06822c346189fcfe8165cc25409ee4e7fc99e69d89ea79adf9b165d6be`）以 `/S /currentuser` 安装到含空格路径时退出码 0。后续磁盘检查发现应用位于请求目录下的 `Godot Codely` 子目录；文件落点必须单独检查，不能只看退出码。
- 另一次完整包运行退出码为 1223、无目录事务日志。当前锁定版本的 `UAC.nsh` 将 1223 定义为用户取消提权；`installer.nsi` 的静默已有机器级安装分支会执行提权。该结果不证明解压崩溃，也不证明所有历史失败均由 UAC 导致。

## 原始产物复现与修复

使用报告中的原始 `fixed-0.1.8-3-setup.exe`（SHA-256 `c6ebbdd53c6053587879554464e5d914879f6c124ac283fa9898fa7cec5cfd82`），以非管理员令牌运行 `/S /currentuser`，目标为原失败目录 `D:\Program Files\Godot Codely`：3.5 秒内退出 2，没有该目标的事务日志，旧应用 exe/asar 的哈希和生产注册均保持不变。该父目录由 Administrators 拥有，普通用户只有读取/执行权限。

生产宏在 `CreateDirectory $dshNewDirectory` 失败后原先直接 `SetErrorLevel 2` + `Quit`，既不记录目标/阶段，也没有交互错误框。这是提取前的失败，不能归因为 7za 引号解析。

修复版在完全相同的原目标、同一非管理员令牌下重复运行，1.9 秒内退出 2，并准确记录 `stage: create-directory failed, error 5`；同样确认旧 exe/asar 和生产注册未变。受保护目录不能由当前用户强行写入，修复的是原先被误认为崩溃的无诊断退出。

另用同一原始 0.1.8-3 产物对照原先报告过的可写目标 `D:\spaced dir\app`：明确指定 `/S /currentuser` 后安装成功，实际注册和 exe/asar 均位于请求目录，payload 与原先可用的 0.1.8-3 一致。完成后恢复原可用安装的注册并清理该测试副本，全部 13 个会话内容不变。这排除了“这个产物遇到空格一定失败”的归因；模式、目标 ACL 和实际文件落点必须一起记录。

修复：

- GUID/staging 创建失败统一记录阶段、目标和错误码；非静默模式显示明确错误与恢复办法，静默模式仍退出 2。
- 保留正常路径上的 NSIS 递归创建行为；仅在其失败后用 `SHCreateDirectoryExW` 重试并读取实际返回码，避免使用不可靠的旧 `GetLastError`。
- 持久日志增加 staging 开始、7za 开始/完成标记，以区分提取前失败、提取异常和后续 promote 失败；日志宏保留调用方 `$0`。
- 不修改安装模式、UAC、用户权限、Profile 或回滚保护。受保护目录仍需要适当的安装模式和管理员授权；修复不会绕过权限。

不能仅凭这条稳定复现把所有历史失败都归为同一个原因。Kimi 已发现的 1223 提权取消、旧产物混用，以及 #48 的 promote 文件锁，应继续按各自阶段解释。

## 本轮 Windows 行为验证

新增 `scripts/probe-installer-spaced-path.ps1`，编译并执行真实 NSIS 可执行文件，直接包含仓库的 `installer-directories.nsh`。使用小型压缩包调用真实 `dshExtractPayload`、stage、promote、rollback 和 finish 宏，不注册应用、不创建快捷方式、不访问 Profile。

```powershell
./scripts/probe-installer-spaced-path.ps1 -MakeNsis <makensis.exe> -SevenZip <7za.exe>
```

目标采用临时目录中的 `Program Files\Godot Codely`：

1. 含空格路径解压、新装成功，payload 内容正确。
2. 持有旧 payload 的无共享删除文件句柄，升级退出 2；旧内容保留，staging/backup 清理完成。
3. 解锁后再次升级退出 0，新内容正确。

上述三项在本机 Windows 通过。探针在 finally 中验证清理路径位于临时目录，并删除自己的工作目录。另一次不含解压的初版目录事务探针也通过三项，最终版本增加真实 7za 解压后重新验证。

新增 `scripts/probe-installer-permission-failure.ps1`，仅把自建临时父目录设为只读，分别验证 `Godot Codely` 与 `NoSpaces`。修复前稳定复现退出 2 而无目标诊断；修复后两者均准确记录 Windows error 5、保留已有安装内容，且没有 staging/backup 残留。探针最终恢复自己的目录 ACL 并清理，不修改系统目录 ACL。

CI 原生行为入口使用本次打包实际携带的 7za 和 electron-builder 锁定的 makensis，无 Office/PPT 准备依赖：

```powershell
node scripts/probe-windows-installer.mjs dist
# 开发包使用 dist-dev；本轮隔离安装器使用 .build/issue55/dist。
```

已将该入口接入 Windows 打包 workflow。基于 `703e452b` 的独立 PR 分支重新执行 `npm ci`，postinstall 完整成功；定向 Vitest：`test/windows-directory-installer.test.ts` 和 `test/release.test.ts` 共 35/35 通过，`npm run typecheck` 通过；原生五项行为探针、Node 语法和差异格式检查通过。

Windows 安装冒烟扩展为 `currentuser` / `allusers` 两种模式，均覆盖含空格新装、锁定回滚、同路径升级和无空格对照；所有用户模式的首个目录位于真正的 `$env:ProgramFiles` 下，并要求管理员令牌。两种模式使用独立 GitHub-hosted VM 和独立截图产物名称。该完整冒烟只允许在 disposable GitHub-hosted runner 运行，不能在开发机上伪造 runner 环境执行。

## 完整安装器验收

通过 `verify-target win32 x64` 后，复用已有 Windows payload，以独立 AppId/GUID 构建完整 NSIS 包；禁用快捷方式和安装后启动。修复版安装器 SHA-256 为 `3202ce9fcf30d0564607c7e82a84ad78eb5b1829faebb304f0db4ddf510deaaf`。这是安装器专项验收包，不是正式发布包；未声称重新验收该旧 payload 的业务运行时或游戏资产组合。

- 修复版真实 GUI：选择当前用户和受保护的含空格目标目录，显示错误码 5、目标路径、日志路径及更换目录/安装模式的建议；未创建目标、未修改旧安装。日志明确为 `stage: create-directory failed`。
- 修复版真实 GUI：可写的含空格路径安装完成，出现完成页面；实际 exe/asar 哈希均与输入 payload 一致，实际注册路径与指定路径一致。
- 完整包矩阵覆盖含空格新装、持锁升级回滚、解锁升级、无空格对照；同时检查实际 exe/asar 哈希、旧 generation marker、注册路径和事务残留。修复前基线与修复后最终矩阵均四项通过；修复版退出码依次为 0、2、0、0，持锁场景保留旧安装，解锁后替换成功。
- 真实 UAC：由非管理员进程启动隔离包 `/S /allusers`，用户手动接受系统授权后，成功安装到 `C:\Program Files\Godot Codely Issue55 Probe`，仅 HKLM 下的独立测试 GUID 注册，exe/asar 哈希正确；生产注册和全部 13 个会话保持不变。没有自动操作或绕过安全授权。
- 机器级测试卸载移除了程序和 HKLM 注册，初次观察窗口超时且留下空测试目录；最终确认只有空目录后，经用户手动授权，用非递归删除单独清理。该观察结果不包装成“卸载器无残留退出”；其余生产注册与会话再次校验不变。

## 交付边界与清理

真实 UAC 安装已验收，未修改提权协议。远端 CI 结果在关联 PR 的 Checks 中核对；完整应用重新构建、发布和用户正式升级仍需正常发布流程。未把安装器专项验收包发布出去。

清理已完成：临时原生探针均在 finally 清理；独立 GUID 的完整测试安装已卸载，其余测试副本已删除。Kimi 的测试安装曾覆盖 HKCU 生产注册，已用原 0.1.8-3 安装器将注册恢复到用户原先可用的 `D:\i48-single`，再归档实验日志并移除无注册引用的临时副本；未运行旧临时安装的卸载器去删除恢复后的生产注册。恢复前后及清理后，全部 13 个会话文件的相对路径与内容整体 SHA-256 一致。

原 `D:\Program Files\Godot Codely` 中的 0.1.6 仍保持不变；未将本次源码修复冒充为已部署到用户正式安装。安装器专项包和本机证据保留在忽略的 `.build/issue55` 中供审查，不能作为正式发布包。
