/**
 * 主进程日志的断管安全写出边界。
 *
 * 桌面应用可能从一个随后被关闭的控制台/管道启动（安装器拉起、终端退出、
 * 日志管道读取端提前关闭）。此时主进程对 stdout/stderr 的同步写会抛出
 * EPIPE/EOF；这些写分布在 Harness 日志镜像、更新检查等回调里，异常无人
 * 捕获，Electron 主进程会弹出系统级 "Uncaught Exception" 错误框
 * （issue #34 P0-1，实机栈：HarnessRuntime.writeLog → console.log）。
 *
 * 这里只在“写”这一边界处理断管类错误：一旦某条流断开，后续写入直接跳过；
 * 其他错误照常抛出，不做全局异常吞没。
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

// 管道写出错有两条路：同步抛（上面拦住）和异步 'error' 事件（无监听器时
// 变成 uncaughtException，栈同样落在 console.log 调用点）。这里只给两条
// 宿主日志流装边界监听器：仅吞 EPIPE/EOF，其余错误照常抛出。
function guardStream(stream: NodeJS.WriteStream): void {
  stream.on('error', (error) => {
    if (isBrokenPipeError(error)) {
      brokenStreams.add(stream)
      return
    }
    throw error
  })
}

guardStream(process.stdout)
guardStream(process.stderr)

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

export function mainLog(level: LogLevel, ...args: unknown[]): void {
  const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout
  logToStream(stream, () => console[level](...args))
}
