window.__ModuleLoader__.load({
  id: 'dsh-godot-stack',
  factory: require => {
    const React = require('react')
    const h = React.createElement
    const NS = 'godot-desktop'
    const zh = {
      engineCrashed: 'Godot 游戏进程异常退出', engineCrashHelp: '请查看下方崩溃日志，并尝试在 Godot 中直接运行项目。可修正项目后重试，或更换引擎；桌面端会保留本次输出。',
      engine: 'Godot 引擎', engineChoose: '选择引擎', engineChange: '更换引擎', engineOpen: '打开 Godot', engineRun: '独立运行游戏', engineStop: '停止独立运行', engineLogs: '运行日志', engineRefresh: '刷新状态与日志', engineNoLogs: '尚无独立运行日志。', engineTruncated: '仅保留最近的日志。', engineDesktopOnly: '请在桌面应用中设置引擎和运行游戏。', engineRunHelp: '独立运行使用已保存的项目。请先保存编辑器中的修改。', engineHelp: '选择 Godot 4 可执行文件。更换后下次启动生效，已有工具连接需重连。', engineStopped: '独立游戏未运行', engineRunning: '独立游戏运行中', engineStarted: '编辑器进程已启动', engineExited: '上次退出码', engineUnchecked: '启动时检查版本', engineUnavailable: '桌面引擎控制暂不可用。',
      ENGINE_UNAVAILABLE: '请回到正常模式的桌面工作台操作。', ENGINE_MISSING: '请先选择 Godot 4 可执行文件。', ENGINE_INVALID: '无法运行此引擎，请重新选择有效的 Godot 可执行文件。', ENGINE_VERSION: '需要 Godot 4.1 或更新的 Godot 4 版本。', ENGINE_BUSY: '引擎正在处理其他操作，请稍后重试。', ENGINE_ALREADY_RUNNING: '此项目已有对应的运行进程。', ENGINE_START_FAILED: '引擎启动失败，请重新检查路径。', ENGINE_STOP_FAILED: '未能停止游戏，请检查实际运行状态。', ENGINE_STOP_TIMEOUT: '停止超时，运行结果未知，请刷新状态。', ENGINE_REQUEST_FAILED: '引擎操作失败，请检查桌面日志后重试。', NO_MAIN_SCENE: '请先在 Godot 中设置并保存启动场景。',
      title: 'Godot 开发', description: '围绕游戏项目进行开发、运行与排错。', projects: '游戏项目', import: '打开项目文件夹', choose: '选择项目', overview: '项目概览', conversation: '开发会话',
      empty: '从一个 Godot 项目开始', emptyHelp: '打开包含 project.godot 的文件夹。项目文件保留在原位置。', loading: '正在读取项目…', retry: '重试',
      ready: 'Godot 项目', notGodot: '此文件夹不是 Godot 项目', notGodotHelp: '请选择包含 project.godot 的项目根目录。已有会话仍可从侧栏继续。',
      start: '开始开发', startHelp: '描述你想做的玩法。Codely 会结合项目协助修改；需要你确认时，会先停下来等待。', recent: '继续开发', noSessions: '还没有开发记录，从一个小目标开始。', untitled: '未命名任务',
      context: '项目信息', path: '项目位置', main: '启动场景', unset: '尚未设置', editor: '编辑器', unknown: '尚未检查', connected: '上次检查已连接', offline: '未连接', refresh: '检查连接',
      editorHelp: '在 Godot 中启用 Godot Codely 插件并连接后，可使用编辑器操作。', play: '在编辑器中运行', stop: '停止编辑器运行', scan: '刷新资源', busy: '正在处理…', done: '操作已完成',
      running: '游戏运行中', stopped: '游戏已停止', unsaved: '编辑器有未保存的场景，请先在 Godot 中保存。', result: '操作结果',
      engineNoticeTitle: '尚未配置 Godot 引擎', engineNoticeHelp: '智能体的运行验证需要 Godot 4 可执行文件。选择一次后，工作台与开发会话共用此路径；也可以直接开始，让智能体自动检测。', engineNoticeAction: '选择 Godot 引擎',
      modelNoticeTitle: '尚未配置模型', modelNoticeHelp: '添加模型后，即可开始协作。你的输入已保留，配置完成后可直接继续。前往「设置 → 模型」添加。', modelNoticeAction: '去配置模型',
      guidance: '从这里推进你的游戏', understand: '读懂这个项目', understandHelp: '梳理场景与脚本，找到玩法的实现位置。', gameplay: '做出一个玩法', gameplayHelp: '比如二段跳、敌人巡逻，或一套背包交互。', troubleshoot: '修好一个问题', troubleshootHelp: '贴上报错和复现步骤，一起找到原因。',
      guidanceHelp: '把目标写进开发会话。修改后回到 Godot 运行，确认实际效果。', show: '展开项目信息', hide: '收起项目信息',
      WORKSPACE_REQUIRED: '请先选择项目。', WORKSPACE_MISSING: '项目已从工作区移除，请重新打开。', NOT_GODOT_PROJECT: '请选择 Godot 项目根目录。', PROJECT_TOO_LARGE: '项目配置过大，无法读取。',
      EDITOR_OFFLINE: '编辑器未连接。请在 Godot 中启用插件并连接，再检查连接。', EDITOR_TIMEOUT: '编辑器响应超时，操作结果未知。请先检查连接与运行状态，再决定是否重试。', EDITOR_BUSY: '编辑器正在处理其他操作，请稍后检查状态。', INVALID_ACTION: '无法识别此操作。', REQUEST_FAILED: '操作失败，请检查 Harness 日志后重试。',
      ORIGIN_REJECTED: '请求来源不匹配，请从桌面应用重新打开。', requestFailed: '无法连接 Harness，请确认服务就绪后重试。', editorFailed: '编辑器未完成操作，请查看下方返回信息。', sessionFailed: '创建开发会话失败，请检查 Harness 日志后重试。'
    }
    const en = {
      engineCrashed: 'Godot game process crashed', engineCrashHelp: 'Review the crash output below and try running the project directly in Godot. Retry after fixing the project, or choose another engine. Desktop keeps the output from this run.',
      engine: 'Godot engine', engineChoose: 'Choose engine', engineChange: 'Change engine', engineOpen: 'Open Godot', engineRun: 'Run game independently', engineStop: 'Stop independent game', engineLogs: 'Run logs', engineRefresh: 'Refresh status and logs', engineNoLogs: 'No independent run logs yet.', engineTruncated: 'Only recent output is retained.', engineDesktopOnly: 'Use the desktop app to configure the engine and run games.', engineRunHelp: 'Independent runs use the saved project. Save editor changes first.', engineHelp: 'Choose the Godot 4 executable. Changes apply to the next launch; reconnect existing tool connections.', engineStopped: 'Independent game is stopped', engineRunning: 'Independent game is running', engineStarted: 'Editor process started', engineExited: 'Last exit code', engineUnchecked: 'Version checked at launch', engineUnavailable: 'Desktop engine controls are unavailable.',
      ENGINE_UNAVAILABLE: 'Use the normal desktop workbench for this action.', ENGINE_MISSING: 'Choose a Godot 4 executable first.', ENGINE_INVALID: 'Cannot run this engine. Choose a valid Godot executable.', ENGINE_VERSION: 'Godot 4.1 or a newer Godot 4 release is required.', ENGINE_BUSY: 'Another engine action is in progress. Retry shortly.', ENGINE_ALREADY_RUNNING: 'This project already has a corresponding running process.', ENGINE_START_FAILED: 'The engine failed to start. Check its path.', ENGINE_STOP_FAILED: 'Could not stop the game. Check its running state.', ENGINE_STOP_TIMEOUT: 'Stopping timed out. The outcome is unknown; refresh its state.', ENGINE_REQUEST_FAILED: 'Engine action failed. Check the desktop log and retry.', NO_MAIN_SCENE: 'Set and save the main scene in Godot first.',
      title: 'Godot Development', description: 'Develop, run, and troubleshoot your game project.', projects: 'Game projects', import: 'Open project folder', choose: 'Choose project', overview: 'Project overview', conversation: 'Development session',
      empty: 'Start with a Godot project', emptyHelp: 'Open the folder containing project.godot. Your files stay in place.', loading: 'Reading project…', retry: 'Retry',
      ready: 'Godot project', notGodot: 'This folder is not a Godot project', notGodotHelp: 'Choose the root folder containing project.godot. Existing sessions remain available in the sidebar.',
      start: 'Start developing', startHelp: 'Describe your gameplay idea. Codely works with your project and pauses whenever your approval is needed.', recent: 'Continue developing', noSessions: 'No development history yet. Start with a small goal.', untitled: 'Untitled task',
      context: 'Project details', path: 'Project location', main: 'Main scene', unset: 'Not configured', editor: 'Editor', unknown: 'Not checked', connected: 'Connected at last check', offline: 'Disconnected', refresh: 'Check connection',
      editorHelp: 'Enable and connect the Godot Codely plugin in Godot to use editor actions.', play: 'Play in editor', stop: 'Stop editor play', scan: 'Refresh resources', busy: 'Working…', done: 'Action completed',
      running: 'Game is running', stopped: 'Game has stopped', unsaved: 'The editor has unsaved scenes. Save them in Godot first.', result: 'Action result',
      engineNoticeTitle: 'Godot engine not configured yet', engineNoticeHelp: 'Run verification needs a Godot 4 executable. Choose it once and both the workbench and development sessions share the path; you can also start directly and let the agent auto-detect it.', engineNoticeAction: 'Choose Godot engine',
      modelNoticeTitle: 'No model configured yet', modelNoticeHelp: 'Add a model to start collaborating. Your input is kept — continue right after configuring. Add one under Settings → Models.', modelNoticeAction: 'Configure a model',
      guidance: 'Move your game forward', understand: 'Explore this project', understandHelp: 'Trace scenes and scripts to find where gameplay lives.', gameplay: 'Build a mechanic', gameplayHelp: 'Try a double jump, enemy patrol, or inventory interaction.', troubleshoot: 'Fix a problem', troubleshootHelp: 'Share an error and steps to reproduce it.',
      guidanceHelp: 'Describe your goal in a development session, then run the changes in Godot to check the result.', show: 'Show project details', hide: 'Hide project details',
      WORKSPACE_REQUIRED: 'Choose a project first.', WORKSPACE_MISSING: 'This workspace was removed. Open the project again.', NOT_GODOT_PROJECT: 'Choose a Godot project root.', PROJECT_TOO_LARGE: 'The project configuration is too large to read.',
      EDITOR_OFFLINE: 'The editor is disconnected. Enable and connect the Godot plugin, then check again.', EDITOR_TIMEOUT: 'The editor timed out. The outcome is unknown. Check the connection and running state before retrying.', EDITOR_BUSY: 'The editor is handling another action. Check its state shortly.', INVALID_ACTION: 'Unrecognized action.', REQUEST_FAILED: 'The action failed. Check the Harness log before retrying.',
      ORIGIN_REJECTED: 'The request origin does not match. Reopen this page from Desktop.', requestFailed: 'Cannot reach Harness. Confirm the service is ready and retry.', editorFailed: 'The editor could not complete the action. See its response below.', sessionFailed: 'Could not create a development session. Check the Harness log and retry.'
    }
    const css = `
      .gcDesktop{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-family:inherit;font-size:14px;line-height:1.6}
      .gcDesktop *{box-sizing:border-box}.gcDesktop :where(.gcHeader,.gcOverview,.gcAside,.gcNotice) :is(button,select){font:inherit;color:inherit}
      .gcDesktop :where(.gcHeader,.gcOverview,.gcAside,.gcNotice) button{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:8px 12px}
      .gcDesktop :where(.gcHeader,.gcOverview,.gcAside,.gcNotice) button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.gcDesktop :where(.gcHeader,.gcOverview,.gcAside,.gcNotice) button:disabled{opacity:.5;cursor:default}
      .gcDesktop :where(.gcHeader,.gcOverview,.gcAside,.gcNotice) :is(button,select):focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
      .gcDesktop .gcPrimary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border-color:transparent}
      .gcDesktop .gcPrimary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
      .gcHeader{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 20px;background:var(--dsw-alias-bg-layer-1);border-bottom:1px solid var(--dsw-alias-border-l2)}
      .gcBrand{font-weight:600;white-space:nowrap}.gcHeader select{max-width:260px;min-width:120px;padding:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
      .gcTabs{display:flex;gap:4px;margin-left:auto}.gcTabs button[aria-pressed=true]{color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-2)}
      .gcBody{display:flex;flex:1;min-height:0;min-width:0;position:relative}.gcMain{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0}
      .gcOverview{overflow:auto;padding:32px;flex:1}.gcOverviewInner{max-width:880px;margin:0 auto}.gcOverview h1{font-size:28px;line-height:1.3;margin:12px 0;font-weight:600}.gcDesktop :is(.gcOverview,.gcAside) h2{font-size:16px;margin:0 0 12px;font-weight:600}.gcDesktop :is(.gcOverview,.gcAside,.gcNotice) p{margin:8px 0 16px}
      .gcMuted{color:var(--dsw-alias-label-secondary);font-size:12px;overflow-wrap:anywhere}.gcEyebrow{font-size:12px;color:var(--dsw-alias-state-business-primary);font-weight:600}
      .gcSection{margin-top:32px}.gcCards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.gcCard{padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}.gcCard p{margin:8px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary)}
      .gcAside{flex:0 0 288px;padding:20px;overflow:auto;border-left:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}.gcAside dl{margin:0}.gcAside dt{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:16px}.gcAside dd{margin:4px 0 0;overflow-wrap:anywhere}.gcActions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.gcAside .gcActions{flex-direction:column}
      .gcEngineLogs{font:12px/1.6 monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;padding:8px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px}
      .gcNotice{margin:12px 20px;padding:12px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);overflow-wrap:anywhere}.gcNotice pre{font:12px/1.6 monospace;white-space:pre-wrap;max-height:160px;overflow:auto}
      .gcSessionList{display:flex;flex-direction:column;gap:8px}.gcSessionList button{text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gcConversation{display:flex;flex:1;flex-direction:column;min-height:0;min-width:0}.gcConversation[hidden]{display:none}
      @media(max-width:1100px){.gcAside{position:absolute;inset:0 0 0 auto;width:min(320px,100%);z-index:2;box-shadow:0 8px 24px var(--dsw-alias-border-l2)}.gcOverview{padding:24px}.gcCards{grid-template-columns:1fr}}
      @media(prefers-reduced-motion:reduce){.gcDesktop *{scroll-behavior:auto}}
    `
    async function callApi(endpoint, workspaceId, body, signal) {
      const response = await fetch('/api/godot-desktop/' + endpoint + '?workspaceId=' + encodeURIComponent(workspaceId), {
        method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal
      })
      const data = await response.json()
      if (!response.ok) throw Object.assign(new Error(data.code), { code: data.code })
      return data
    }
    /** Native controls remain separate from editor-bridge Play/Stop. */
    function EnginePanel({ workspaceId, active, t }) {
      const native = window.__GODOT_DESKTOP_ENGINE__
      if (!native) return h('section', { className: 'gcSection' }, h('h2', null, t('engine')), h('p', { className: 'gcMuted' }, t('engineDesktopOnly')))
      const [snapshot, setSnapshot] = React.useState(null)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const generation = React.useRef(0)
      const pending = React.useRef(null)
      const perform = async (action, quiet = false) => {
        const current = generation.current
        if (pending.current?.generation === current) return
        const ticket = { generation: current }
        pending.current = ticket
        if (!quiet) { setBusy(true); setError('') }
        try {
          const response = await native[action](...(action === 'choose' ? [] : [workspaceId]))
          if (current !== generation.current) return
          if (!response.ok) { setError(response.code); return }
          setError('')
          if (action === 'choose' && workspaceId) {
            const updated = await native.status(workspaceId)
            if (current !== generation.current) return
            if (!updated.ok) { setError(updated.code); return }
            setSnapshot(updated.state)
          } else setSnapshot(response.state)
        } catch { if (current === generation.current) setError('engineUnavailable') }
        finally { if (pending.current === ticket) pending.current = null; if (current === generation.current) setBusy(false) }
      }
      React.useEffect(() => {
        generation.current++
        setSnapshot(null); setError(''); setBusy(false)
        if (active) void perform('status')
        return () => { generation.current++ }
      }, [workspaceId, active])
      React.useEffect(() => {
        if (!active || (!snapshot?.running && !snapshot?.editorRunning)) return
        const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') void perform('status', true) }, 1500)
        return () => window.clearInterval(timer)
      }, [workspaceId, active, snapshot?.running, snapshot?.editorRunning])
      const action = (key, method, disabled) => h('button', { type: 'button', disabled: busy || disabled, onClick: () => perform(method) }, t(key))
      // Windows NTSTATUS exits can reach Node as either signed or unsigned integers.
      const crashed = !snapshot?.running && snapshot?.exitCode != null && (snapshot.exitCode >>> 0) >= 0x80000000
      return h('section', { className: 'gcSection', 'aria-label': t('engine') }, h('h2', null, t('engine')),
        h('p', { className: 'gcMuted' }, snapshot ? snapshot.path || t('ENGINE_MISSING') : t('loading')),
        snapshot?.path && h('p', { className: 'gcMuted' }, snapshot.version || t('engineUnchecked')),
        h('p', { role: 'status' }, busy ? t('busy') : t(error || !snapshot ? 'unknown' : snapshot.running ? 'engineRunning' : crashed ? 'engineCrashed' : 'engineStopped')),
        snapshot?.editorRunning && h('p', { className: 'gcMuted' }, t('engineStarted')),
        snapshot?.exitCode != null && h('p', { className: 'gcMuted' }, t('engineExited') + ': ' + snapshot.exitCode),
        error && h('p', { role: 'alert' }, t(error)),
        crashed && h('p', { role: 'alert' }, t('engineCrashHelp')),
        h('div', { className: 'gcActions' }, action(snapshot?.path ? 'engineChange' : 'engineChoose', 'choose', false),
          action('engineOpen', 'open', !workspaceId || !snapshot?.path || snapshot?.editorRunning),
          action('engineRun', 'run', !workspaceId || !snapshot?.path || snapshot?.running),
          action('engineStop', 'stop', !workspaceId || !snapshot?.running), action('engineRefresh', 'status', false)),
        h('p', { className: 'gcMuted' }, t('engineRunHelp')), h('p', { className: 'gcMuted' }, t('engineHelp')),
        h('details', { key: crashed ? 'crashed' : 'normal', ...(crashed ? { open: true } : {}) }, h('summary', null, t('engineLogs')), snapshot?.truncated && h('p', { className: 'gcMuted' }, t('engineTruncated')),
          h('pre', { className: 'gcEngineLogs', tabIndex: 0, 'aria-label': t('engineLogs') }, snapshot?.logs || t('engineNoLogs'))))
    }
    function Desktop({ service, entry, active, conversation, ctx, t }) {
      React.useSyncExternalStore(React.useCallback(fn => ctx.locale.subscribe(fn), [ctx]), () => ctx.locale.getSnapshot())
      const workspaces = React.useSyncExternalStore(React.useCallback(fn => ctx.workspaces.list.subscribe(fn), [ctx]), () => ctx.workspaces.list.getSnapshot())
      const sessions = React.useSyncExternalStore(React.useCallback(fn => ctx.sessions.list.subscribe(fn), [ctx]), () => ctx.sessions.list.getSnapshot())
      const state = React.useSyncExternalStore(React.useCallback(fn => service.subscribe(fn), [service]), () => service.getSnapshot())
      const currentId = service.currentSession()
      const current = sessions.byId[currentId]
      const [selected, setSelected] = React.useState('')
      const [view, setView] = React.useState('overview')
      const [details, setDetails] = React.useState(() => window.innerWidth > 1100)
      const [project, setProject] = React.useState(null)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [revision, setRevision] = React.useState(0)
      const [editor, setEditor] = React.useState(null)
      const [result, setResult] = React.useState(null)
      const [engine, setEngine] = React.useState({ checked: false, missing: false, path: '' })
      const request = React.useRef(null)
      const pending = React.useRef(false)
      const available = workspaces.items.filter(item => service.workspaceVisible(item.workspaceId, entry.id))
      const chosen = available.find(item => item.workspaceId === selected) || available.find(item => item.path === current?.cwd) || available[0]
      const workspaceId = chosen?.workspaceId
      React.useEffect(() => {
        if (!active) return
        const controller = new AbortController()
        setProject(null); setEditor(null); setResult(null); setError('')
        if (workspaceId) callApi('project', workspaceId, undefined, controller.signal).then(data => { if (!controller.signal.aborted) setProject(data) }).catch(e => { if (!controller.signal.aborted) setError(e.code || 'requestFailed') })
        return () => controller.abort()
      }, [workspaceId, active, revision])
      React.useEffect(() => { if (currentId && state.state.sessionBindings[currentId] === entry.id) { setSelected(''); setView('conversation') } }, [currentId, entry.id])
      React.useEffect(() => () => request.current?.abort(), [workspaceId, active])
      const native = window.__GODOT_DESKTOP_ENGINE__
      // The engine path is global: status works without a workspace, so
      // first-run users see the notice before importing any project.
      React.useEffect(() => {
        if (!active || !native) { setEngine({ checked: false, missing: false, path: '' }); return }
        let stale = false
        native.status(workspaceId).then(response => {
          if (stale) return
          setEngine({ checked: true, missing: response.ok && !response.state?.path, path: response.state?.path || '' })
        }).catch(() => { if (!stale) setEngine({ checked: true, missing: false, path: '' }) })
        return () => { stale = true }
      }, [workspaceId, active])
      // No configured model disables "start" with guidance instead of a silent failure.
      const [models, setModels] = React.useState(null)
      React.useEffect(() => {
        if (!active || !ctx.remote?.session?.modelCatalog) return
        let stale = false
        ctx.remote.session.modelCatalog().then(catalog => {
          if (stale) return
          setModels(catalog.ok && catalog.value.groups.some(group => group.models.length > 0))
        }).catch(() => { if (!stale) setModels(null) })
        return () => { stale = true }
      }, [active])
      const chooseEngine = () => run(async () => {
        if (!native) return
        const picked = await native.choose()
        if (!picked.ok) return
        const updated = await native.status(workspaceId)
        setEngine({ checked: true, missing: updated.ok && !updated.state?.path, path: updated.state?.path || '' })
        if (workspaceId) setRevision(value => value + 1)
      })
      const run = async task => {
        if (pending.current) return
        pending.current = true; setBusy(true); setError(''); setResult(null)
        const controller = new AbortController(); request.current = controller
        try { await task(controller.signal) }
        catch (e) { if (!controller.signal.aborted) { setError(e.code || 'requestFailed'); if (e.code?.startsWith('EDITOR_')) setEditor(e.code === 'EDITOR_OFFLINE' ? { offline: true } : null) } }
        finally { pending.current = false; if (request.current === controller) { setBusy(false); request.current = null } }
      }
      const createSession = () => run(async signal => {
        const created = await callApi('session', workspaceId, {}, signal)
        if (signal.aborted) return
        // Use the provider-scoped service proxy: the frame's service belongs to
        // the host and deliberately cannot claim a provider package identity.
        await ctx.desktopWorkbenches.ensureSession({ folder: project.path, sessionId: created.sessionId })
        if (!signal.aborted) setView('conversation')
      })
      const editorAction = action => run(async signal => {
        const data = await callApi('editor', workspaceId, { action }, signal)
        if (signal.aborted) return
        setEditor(data); setResult(data)
        if (!data.ok) setError(Array.isArray(data.unsaved_scenes) ? 'unsaved' : 'editorFailed')
      })
      const owned = !!currentId && state.state.sessionBindings[currentId] === entry.id
      const recent = sessions.ids.filter(id => state.state.sessionBindings[id] === entry.id && sessions.byId[id]?.cwd === project?.path).slice(0, 6)
      const button = (key, onClick, disabled = busy, props = {}) => h('button', { type: 'button', disabled, onClick, ...props }, t(key))
      return h('section', { className: 'gcDesktop', 'aria-label': t('title') },
        h('header', { className: 'gcHeader' }, h('span', { className: 'gcBrand' }, t('title')),
          h('select', { 'aria-label': t('choose'), value: workspaceId || '', disabled: busy, onChange: e => { setSelected(e.target.value); setView('overview') } }, !workspaceId && h('option', { value: '' }, t('choose')), ...available.map(item => h('option', { key: item.workspaceId, value: item.workspaceId }, item.title))),
          h('nav', { className: 'gcTabs', 'aria-label': t('title') }, button('overview', () => setView('overview'), false, { 'aria-pressed': view === 'overview' }), button('conversation', () => setView('conversation'), !owned, { 'aria-pressed': view === 'conversation' })),
          button(details ? 'hide' : 'show', () => setDetails(!details), false, { 'aria-expanded': details })),
        error && h('div', { className: 'gcNotice', role: 'alert' }, t(error), h('div', { className: 'gcActions' }, button('retry', () => setRevision(value => value + 1)))),
        busy && h('div', { className: 'gcNotice', role: 'status' }, t('busy')),
        h('div', { className: 'gcBody' }, h('main', { className: 'gcMain' },
          h('div', { className: 'gcConversation', hidden: view !== 'conversation' || !owned }, conversation),
          view === 'overview' && h('div', { className: 'gcOverview' }, h('div', { className: 'gcOverviewInner' },
            h('span', { className: 'gcEyebrow' }, 'GODOT CODELY'),
            h('h1', null, !workspaceId ? t('empty') : project ? project.name : t('loading')),
            h('p', { className: 'gcMuted' }, project?.path || t('emptyHelp')),
            project && !project.godot && h('div', { className: 'gcCard' }, h('h2', null, t('notGodot')), h('p', null, t('notGodotHelp'))),
            engine.checked && engine.missing && native && h('div', { className: 'gcNotice', role: 'status' }, h('strong', null, t('engineNoticeTitle')), h('p', null, t('engineNoticeHelp')), h('div', { className: 'gcActions' }, button('engineNoticeAction', chooseEngine, busy, { className: 'gcPrimary' }))),
            project?.godot && models === false && h('div', { className: 'gcNotice', role: 'status' }, h('strong', null, t('modelNoticeTitle')), h('p', null, t('modelNoticeHelp'))),
            h('div', { className: 'gcActions' }, project?.godot && button('start', createSession, busy || models === false, { className: 'gcPrimary' }), button('import', () => run(async signal => {
              const path = await ctx.uiWorkspace.pickDirectory()
              if (!path || signal.aborted) return
              const workspace = await ctx.workspaces.create({ path })
              if (!signal.aborted) { await service.showWorkspace(workspace.workspaceId, entry.id); setSelected(workspace.workspaceId) }
            }))),
            project?.godot && h(React.Fragment, null,
              h('p', { className: 'gcMuted' }, t('startHelp')),
              h('section', { className: 'gcSection' }, h('h2', null, t('guidance')), h('div', { className: 'gcCards' }, ...['understand', 'gameplay', 'troubleshoot'].map(key => h('article', { key, className: 'gcCard' }, h('strong', null, t(key)), h('p', null, t(key + 'Help'))))), h('p', { className: 'gcMuted' }, t('guidanceHelp'))),
              h('section', { className: 'gcSection' }, h('h2', null, t('recent')), recent.length ? h('div', { className: 'gcSessionList' }, ...recent.map(id => h('button', { key: id, type: 'button', disabled: busy, onClick: () => run(() => ctx.desktopWorkbenches.ensureSession({ sessionId: id })) }, sessions.byId[id].displayTitle || t('untitled')))) : h('p', { className: 'gcMuted' }, t('noSessions'))))))),
          details && h('aside', { className: 'gcAside', 'aria-label': t('context') }, h('h2', null, t('context')), h('dl', null,
            h('dt', null, t('path')), h('dd', null, project?.path || t('unset')),
            h('dt', null, t('main')), h('dd', null, project?.mainScene || t('unset'))),
            h(EnginePanel, { key: String(workspaceId) + ':' + revision, workspaceId: project?.godot ? workspaceId : undefined, active, t }), h('dl', null,
            h('dt', null, t('editor')), h('dd', { role: 'status' }, t(editor?.ok ? 'connected' : editor?.offline ? 'offline' : 'unknown'))),
            h('p', { className: 'gcMuted' }, t('editorHelp')),
            h('div', { className: 'gcActions' }, button('refresh', () => editorAction('status'), busy || !project?.godot), button('play', () => editorAction('play'), busy || !editor?.ok), button('stop', () => editorAction('stop'), busy || !editor?.ok), button('scan', () => editorAction('scan'), busy || !editor?.ok)),
            result && h('section', { className: 'gcSection', 'aria-live': 'polite' }, h('h2', null, t('result')), h('p', null, t(result.ok ? result.playing === true ? 'running' : result.playing === false ? 'stopped' : 'done' : 'editorFailed')), h('details', null, h('summary', null, t('result')), h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify(result, null, 2)))))))
    }
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }))
      const t = ctx.locale.bind(NS)
      ctx.effect(() => {
        if (document.querySelector('[data-plugin-css="godot-desktop"]')) return
        const style = document.createElement('style'); style.dataset.pluginCss = 'godot-desktop'; style.textContent = css
        document.head.appendChild(style)
        return () => style.remove()
      })
      const Panel = props => h(Desktop, { ...props, ctx, t })
      ctx.effect(() => ctx.desktopWorkbenches.register({ title: t('title'), description: t('description'), panelTitle: t('context'), repository: 'https://github.com/hhhh124hhhh/godot-codely-desktop', customFrame: true }, Panel))
    }
    return { apply, inject: ['desktopWorkbenches', 'locale', 'workspaces', 'sessions', 'uiWorkspace'], Desktop, EnginePanel, callApi }
  }
})
