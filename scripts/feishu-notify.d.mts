export interface FeishuNotifyOptions {
  title: string
  level: 'info' | 'success' | 'warning' | 'error'
  messages: string[]
  keyword: string
}

export function buildPayload(options: FeishuNotifyOptions): Record<string, unknown>
export function resolveWebhook(cliWebhook: string): string
