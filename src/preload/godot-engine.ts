import type { GodotEngineAction, GodotEngineBridge, GodotEngineResult } from '../shared/godot-engine'

export function createGodotEngineBridge(invoke: (channel: string, request: { action: GodotEngineAction; workspaceId?: string }) => Promise<GodotEngineResult>): GodotEngineBridge {
  return {
    status: workspaceId => invoke('godot-engine:command', { action: 'status', workspaceId }),
    choose: () => invoke('godot-engine:command', { action: 'choose' }),
    open: workspaceId => invoke('godot-engine:command', { action: 'open', workspaceId }),
    run: workspaceId => invoke('godot-engine:command', { action: 'run', workspaceId }),
    stop: workspaceId => invoke('godot-engine:command', { action: 'stop', workspaceId })
  }
}
