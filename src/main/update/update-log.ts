/**
 * 更新日志的断管安全写入边界。
 *
 * 桌面应用可能从一个随后被关闭的控制台/管道启动（安装器拉起、终端退出）。
 * 此时对 stdout/stderr 的同步写会抛出 EPIPE/EOF；这些写发生在 setTimeout 回调和
 * electron-updater 事件处理器里，异常无人捕获，Electron 主进程会弹出系统级
 * "Uncaught Exception" 错误框（issue #34 P0-1）。这里只在“写”这一边界处理
 * 断管类错误：一旦某条流断开，后续写入直接跳过；其他错误照常抛出，
 * 不做全局异常吞没。
 */

const brokenStreams = new WeakSet<object>()

export function isBrokenPipeError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'EPIPE' || error.code === 'EOF')
  )
}

export function logToStream(stream: NodeJS.WriteStream, write: () => void): void {
  if (brokenStreams.has(stream)) return
  if (!stream.writable) return
  try {
    write()
  } catch (error) {
    if (!isBrokenPipeError(error)) throw error
    brokenStreams.add(stream)
  }
}

export function logUpdate(level: 'info' | 'warn' | 'error' | 'debug', args: unknown[]): void {
  const stream = level === 'info' || level === 'debug' ? process.stdout : process.stderr
  logToStream(stream, () => console[level]('[updater]', ...args))
}
