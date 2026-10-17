import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.{test,spec}.{ts,js,mjs}'],
    // Native Intel runners and Windows CI contend for CPU and disk while integration suites
    // unpack archives and launch subprocesses (hitting EBUSY locks). Keep every test, but serialize files.
    fileParallelism: !(
      process.env.CI &&
      ((process.platform === 'darwin' && process.arch === 'x64') || process.platform === 'win32')
    ),
    testTimeout: 60_000,
    server: {
      deps: {
        // Patched upstream providers must run inside the module runner so
        // tests can mock their node_modules imports (e.g. chokidar).
        inline: [/@deepseek-ai\/dsh-skill-filesystem/]
      }
    }
  }
})
