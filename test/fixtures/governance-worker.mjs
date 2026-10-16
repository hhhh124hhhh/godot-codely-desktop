import { ProjectStore, projectHandoff } from '../../packages/dsh-godot-stack/governance/index.mjs'
const [home, root, mode, command] = process.argv.slice(2)
const store = new ProjectStore(home, mode === 'crash' ? { beforePublish: async () => process.exit(73) } : {})
try {
  const value = mode === 'read' ? await store.read(root) : await store.commit(root, JSON.parse(command))
  console.log(JSON.stringify(mode === 'read' ? { ...value, handoff: projectHandoff(value) } : value))
} catch (error) { console.log(JSON.stringify({ code: error.code, message: error.message })); process.exitCode = 2 }
