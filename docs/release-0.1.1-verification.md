# 0.1.1 安装包与品牌验收

## 已定位的问题

- GitHub `v0.1.0-unsigned` 发布于北京时间 2026-10-15 07:29，来源提交为 `97955799418d3b2d6eeabeb7707f71ca1c68281e`。其 Windows 安装器为 259,701,136 字节；它不包含后续工作台和品牌资源变更。
- 2026-10-15 的发布运行 `38694224283` 已完成安装包构建，但 unsigned 发布任务在合并 macOS 元数据时因缺少 `yaml` 报 `ERR_MODULE_NOT_FOUND`，没有上传新附件。现在与其他发布任务一样，先执行锁定依赖的 `npm ci --ignore-scripts`，再运行元数据工具。
- PR 构建仅上传 Actions artifact。`main` 代码合并后由 `release-orchestrate.yml` 自动触发 unsigned 发布；所选平台构建及 Windows 安装/UI 验收全部成功后，才上传 GitHub Release。
- 旧流程允许不同提交覆盖同一个版本的附件，导致版本号、tag 和实际代码可能失配。现在新代码必须增加版本；相同提交可以重试发布。Release 记录源码提交、工作流和附件 SHA-256。
- 独立导入页未随工作台更新文案及配色。现在使用 Godot Codely 工作台表述和对应深浅主题；保留真实的 DeepSeek Harness 导入来源、插件清单和数据复制边界。

## 安装耗时的证据与边界

本机历史 `dist/win-unpacked` 产物约 1,012 MiB，8,931 个文件。其中 Office/Python 占 7,289 个文件、约 163 MiB，`app.asar.unpacked` 占 1,600 个文件、约 265 MiB。该数据用于说明解压与文件扫描负担，不代表 0.1.1 的最终安装包大小，也不能单独证明用户机器的耗时原因。

本轮在生成阶段仅排除 NumPy/pandas 的第三方 tests 目录树；旧载荷中对应 1,610 个文件、约 18.7 MiB，约占旧完整安装目录文件数的 18%。保留运行库、numpy.testing/pandas.testing、原生扩展、数据和许可证，载荷 digest 包含部署策略版本。

安装流程保留目录 staging、原安装备份和失败回滚，不通过删除功能或提前移除旧程序来缩短安装。Windows 安装 smoke 新增每个阶段的耗时输出（轮询精度 15 秒）。没有实测前不宣称安装速度改善。

## 发布前后的验收

- 源图标为 `build/brand-mark.svg`，由 `brand:prepare` 生成 `.build/brand-assets`；Windows EXE/NSIS 安装器与卸载器明确使用其 ICO，独立导入页使用其 PNG。
- 已在隔离 userData 的真实 Electron 中检查导入页中英文、深浅主题四种组合，图标加载、标题和按钮、横向溢出检查通过。
- 必须等待当前提交的 Windows/Linux PR 检查通过再合并。发布构建还需独立通过所选平台检查和 Windows 安装/UI smoke，不能用 PR 通过替代 Release 发布成功。
- 下载入口以新 `v0.1.1-unsigned` Release 为准。发布完成前，旧 Release 仍是旧版本；不得声称新包已经上传。
