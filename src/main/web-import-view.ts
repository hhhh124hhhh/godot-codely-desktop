import type { WebHomePreview } from './state/web-home-import'

export type WebImportLocale = 'en' | 'zh'

export interface WebImportViewModel {
  locale: WebImportLocale
  brand: string
  badge: string
  heading: string
  summary: string
  stats: string[]
  plugins: string[]
  pluginsLabel?: string
  safetyNote: string
  primaryLabel: string
  primaryBusyLabel: string
  secondaryLabel: string
  notice?: string
}

export function buildWebImportViewModel(options: {
  locale: WebImportLocale
  preview: WebHomePreview
  notice?: string
}): WebImportViewModel {
  const zh = options.locale === 'zh'
  const sessionCount = options.preview.sessionCount ?? 0
  const workspaceCount = options.preview.workspaceCount ?? 0
  const presetCount = options.preview.presetCount ?? 0
  const plugins = [...(options.preview.plugins ?? [])]
  const stats = zh
    ? [
        `${sessionCount} 个会话`,
        `${workspaceCount} 个工作区`,
        `${presetCount} 个自定义助手`,
        options.preview.hasCredentials ? '已保存模型密钥' : '未检测到模型密钥'
      ]
    : [
        `${sessionCount} session${sessionCount === 1 ? '' : 's'}`,
        `${workspaceCount} workspace${workspaceCount === 1 ? '' : 's'}`,
        `${presetCount} custom assistant preset${presetCount === 1 ? '' : 's'}`,
        options.preview.hasCredentials ? 'Model credentials found' : 'No model credentials found'
      ]

  return {
    locale: options.locale,
    brand: 'Godot Codely',
    badge: zh ? '首次启动' : 'Get started',
    heading: zh ? '将已有工作带入 Godot Codely' : 'Bring your work to Godot Codely',
    summary: zh
      ? '检测到本机 DeepSeek Harness 网页版的会话与设置。你可以复制到 Godot Codely，继续已有工作，也可以创建全新的游戏开发工作台。'
      : 'Sessions and settings from DeepSeek Harness web were found on this computer. Copy them to Godot Codely to continue your work, or start a fresh game development workspace.',
    stats,
    plugins,
    pluginsLabel: plugins.length > 0
      ? zh
        ? `将重装 ${plugins.length} 个社区插件`
        : `${plugins.length} community plugin${plugins.length === 1 ? '' : 's'} will be reinstalled`
      : undefined,
    safetyNote: zh
      ? '只复制会话、设置、密钥和工作区清单。网页版可以继续使用。'
      : 'Only sessions, settings, credentials, and workspace records are copied. The web copy remains usable.',
    primaryLabel: zh ? '导入到工作台' : 'Import to workspace',
    primaryBusyLabel: zh ? '正在导入…' : 'Importing…',
    secondaryLabel: zh ? '创建全新工作台' : 'Start fresh',
    notice: options.notice
  }
}
