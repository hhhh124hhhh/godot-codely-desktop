/** Loaded inside an isolated, real Harness Profile. All records are test fixtures. */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { assembleContextFor } from '@deepseek-ai/dsh-agent'
import assert from 'node:assert/strict'
export const name = 'issue24-g1b-reopen-probe'
export const inject = ['systemPrompt', 'agents', 'sandboxPolicy', 'approval', 'tools']
export async function apply(ctx) {
  const handles = []
  let result
  try {
    const runtime = process.env.ISSUE24_RUNTIME
    const { ProjectStore, projectHandoff } = await import(new URL('./governance/index.mjs', runtime).href)
    const store = new ProjectStore(process.env.DSH_HOME)
    const root = process.env.ISSUE24_PROJECT
    const policyBefore = { mode: ctx.sandboxPolicy.defaultMode, approval: ctx.approval.config.policy }
    const toolsBefore = ctx.tools.schemas().map(tool => tool.name).sort()
    const plugin = await import(new URL('./index.js', runtime).href)
    const registration = ctx.plugin(plugin, { bridge: false })
    await registration
    if (process.env.ISSUE24_PHASE === 'write' && process.env.ISSUE24_REAL_EVIDENCE) {
      const evidence = JSON.parse(await readFile(process.env.ISSUE24_REAL_EVIDENCE, 'utf8'))
      const actor = { kind: 'ADAPTER', id: 'real-project-readonly-probe' }
      let state = await store.create(root, { actor, reason: 'User requested G1b acceptance on a real project; isolated Profile only' })
      const command = changes => ({ projectId: state.projectId, expectedStateRevision: state.stateRevision, expectedImplementationFingerprint: state.implementationRevision.contentFingerprint, actor, reason: 'Read-only real project acceptance; no new execution grant', changes })
      state = await store.commit(root, command({
        currentTask: { id: 'G1B-REAL-PROJECT', runId: 'readonly-1', intent: 'Verify restart and Agent handoff on a real Godot project', boundary: 'Read project files only; isolated governance data; no gameplay, save, publishing or unattended work', stop: 'Stop on input changes or untrusted state', stage: 'WITNESS', progress: 'Project entry and scene dependency files checked; desktop UI acceptance pending', unverifiedChanges: ['No gameplay validation', 'No actual desktop window acceptance'], stopReason: 'EXPERIENCE_PENDING', requiresHuman: 'Assess whether restored handoff reduces repeated instructions', recommendedNextAction: 'Complete isolated desktop restart acceptance' },
        implementationRevision: { contentFingerprint: evidence.fingerprint, gitHead: null, godotVersion: null }
      }))
      const observation = (id, outcome, assertions) => ({ id, projectId: state.projectId, taskId: 'G1B-REAL-PROJECT', runId: 'readonly-1', kind: 'readonly-project-inspection', provenance: 'ADAPTER_CAPTURED', outcome, inputFingerprint: evidence.fingerprint, environmentFingerprint: process.version, assertions, artifactRefs: ['real-project-evidence.json'], limitations: ['Selected file fingerprint only; not complete project content', 'No Godot execution, gameplay or desktop UI verification'], observedAt: evidence.observedAt })
      await store.commit(root, command({ appendObservations: [observation('ENTRY-FILES', 'PASS', evidence.assertions), observation('DESKTOP-EXPERIENCE', 'UNKNOWN', ['Desktop restart and human handoff usefulness not yet verified'])] }))
    }
    if (process.env.ISSUE24_PHASE === 'write' && !process.env.ISSUE24_REAL_EVIDENCE) {
      const actor = { kind: 'HUMAN', id: 'fixture-owner' }
      let state = await store.create(root, { actor, reason: 'G1b isolated restart probe; not a real user project' })
      const update = (changes, who = actor) => ({ projectId: state.projectId, expectedStateRevision: state.stateRevision, expectedImplementationFingerprint: state.implementationRevision.contentFingerprint, actor: who, reason: 'Explicit fixture operation', changes })
      const fingerprint = createHash('sha256').update(await readFile(join(root, 'player.gd'))).digest('hex')
      state = await store.commit(root, update({ currentTask: { id: 'G1B-FIXTURE', runId: 'run-1', intent: 'Preserve restart facts', boundary: 'Persistence only; no gameplay changes', stop: 'Stop on unknown state integrity', stage: 'WITNESS', progress: 'Local fixture verification captured; device validation pending', unverifiedChanges: ['Android device not checked'], stopReason: 'WAIT_HUMAN', requiresHuman: 'Is this handoff sufficient to resume context?', recommendedNextAction: 'Review restored facts; do not restart work from memory' }, implementationRevision: { contentFingerprint: fingerprint, gitHead: null, godotVersion: null } }))
      const delegation = { delegationId: 'D-1', projectId: state.projectId, taskId: 'G1B-FIXTURE', intent: 'Record facts only', boundary: 'Local fixture', stop: 'No unattended work', allowedActions: ['record progress'], forbiddenActions: ['publish', 'change gameplay'], approvedBy: actor, approvedStateRevision: state.stateRevision + 1, approvedPolicyVersion: state.policyVersion, expiresAt: '2020-01-01T00:00:00Z', budget: { maxRuns: 1, maxToolCalls: 2, usedRuns: 0, usedToolCalls: 0 }, status: 'RECORDED', triggerMode: 'MANUAL', triggerStatus: 'NOT_AVAILABLE' }
      state = await store.commit(root, update({ delegation }))
      const success = await promisify(execFile)(process.execPath, ['-e', 'require("node:assert/strict").equal(require("node:fs").readFileSync(process.argv[1],"utf8"),"extends Node\\n"); console.log("FIXTURE_FILE_VERIFIED")', join(root, 'player.gd')], { windowsHide: true })
      let failure
      try { await promisify(execFile)(process.execPath, ['-e', 'console.error("INTENTIONAL_FIXTURE_FAILURE"); process.exit(17)'], { windowsHide: true }) }
      catch (error) { assert.equal(error.code, 17); failure = 'exitCode=' + error.code + '\n' + (error.stderr ?? '') }
      assert.ok(failure)
      await writeFile(join(root, 'verification.txt'), 'file assertion exitCode=0\n' + (success.stdout ?? '') + failure)
      const observation = (id, outcome, assertion) => ({ id, projectId: state.projectId, taskId: 'G1B-FIXTURE', runId: 'run-1', kind: 'integration', provenance: 'ADAPTER_CAPTURED', outcome, inputFingerprint: fingerprint, environmentFingerprint: process.version, assertions: [assertion], artifactRefs: ['verification.txt'], limitations: ['Restart fixture only; no Godot/FUN/device Gate'], observedAt: new Date().toISOString() })
      state = await store.commit(root, update({ appendObservations: [observation('EV-PASS', 'PASS', 'Actual Node file assertion passed'), observation('EV-FAIL', 'FAIL', 'Intentional Node subprocess exited 17')] }, { kind: 'ADAPTER', id: 'reopen-probe' }))
    }
    const loaded = await store.read(root)
    const handoffs = []
    for (const [id, cwd] of [['agent-a', root], ['agent-b', root], ['other-project', process.env.ISSUE24_OTHER_PROJECT]]) {
      const handle = process.env.ISSUE24_PHASE === 'reopen' && id === 'agent-a'
        ? await ctx.agents.resume({ resumeSessionId: 'agent-a', agentOptions: { provider: 'unconfigured', model: 'never-called' } })
        : await ctx.agents.create({ sessionId: id === 'agent-a' ? id : process.env.ISSUE24_PHASE + '-' + id, meta: { cwd }, agentOptions: { provider: 'unconfigured', model: 'never-called' } })
      handles.push(handle)
      const assembly = await ctx.systemPrompt.assemble(assembleContextFor(handle.agent))
      const restored = assembly.contexts.filter(item => item.name === 'godot-project-handoff')
      if (id === 'other-project') assert.equal(restored.length, 0)
      else { assert.equal(restored.length, 1); handoffs.push(restored[0].text) }
    }
    assert.equal(handoffs[0], handoffs[1])
    await registration.dispose()
    const afterUnload = await ctx.systemPrompt.assemble(assembleContextFor(handles[0].agent))
    assert.equal(afterUnload.contexts.filter(item => item.name === 'godot-project-handoff').length, 0)
    await ctx.plugin(plugin, { bridge: false })
    const afterReload = await ctx.systemPrompt.assemble(assembleContextFor(handles[0].agent))
    assert.equal(afterReload.contexts.filter(item => item.name === 'godot-project-handoff').length, 1)
    assert.equal(ctx.sandboxPolicy.defaultMode, policyBefore.mode)
    assert.equal(ctx.approval.config.policy, policyBefore.approval)
    assert.deepEqual(ctx.tools.schemas().map(tool => tool.name).sort(), toolsBefore)
    result = { passed: true, state: loaded.state, handoff: projectHandoff(loaded), promptHandoff: handoffs[0], permissionUnchanged: policyBefore, toolsUnchanged: true, unloadReloadPreserved: true }
  } catch (error) { result = { passed: false, failure: error.stack } }
  finally {
    for (const handle of handles.reverse()) await handle.dispose()
    await writeFile(process.env.ISSUE24_RECEIPT, JSON.stringify(result, null, 2))
  }
}
