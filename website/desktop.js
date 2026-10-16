const $ = (selector) => document.querySelector(selector)
const layout = $('.content-layout')
let toastTimer
function notify(message) {
  $('#toast').textContent = message
  $('#toast').hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { $('#toast').hidden = true }, 5000)
}
function showView(view) {
  $('#overview').hidden = view !== 'overview'
  $('#session').hidden = view !== 'session'
  $('#breadcrumb').textContent = view === 'overview' ? '项目总览' : '角色二段跳与落地反馈'
  $('.nav-item[data-view]').classList.toggle('selected', view === 'overview')
  $('.session[data-view]').classList.toggle('selected', view === 'session')
}
function showInspector(tab) {
  for (const name of ['context', 'changes', 'checks']) {
    $(`#panel-${name}`).hidden = name !== tab
    $(`#tab-${name}`).setAttribute('aria-selected', String(name === tab))
  }
  layout.classList.remove('panel-hidden')
  layout.classList.add('panel-open')
  $('#inspector').hidden = false
  $('#inspector-toggle').setAttribute('aria-expanded', 'true')
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)))
document.querySelectorAll('[data-inspector]').forEach(button => button.addEventListener('click', () => showInspector(button.dataset.inspector)))
document.querySelectorAll('[role="tab"]').forEach((tab, index, tabs) => tab.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
  tabs[next].focus()
  showInspector(tabs[next].dataset.inspector)
}))
$('#inspector-toggle').addEventListener('click', () => {
  const visible = getComputedStyle($('#inspector')).display !== 'none' && !$('#inspector').hidden
  $('#inspector').hidden = visible
  layout.classList.toggle('panel-hidden', visible)
  layout.classList.toggle('panel-open', !visible)
  $('#inspector-toggle').setAttribute('aria-expanded', String(!visible))
})
$('#theme').addEventListener('click', () => { document.body.classList.toggle('dark') })
const actions = {
  editor: '正式版将通过现有 Godot 工具启动独立编辑器；需配置 GODOT_PATH。本原型不会启动进程。',
  run: '正式版将发起真实运行并返回结果。本原型未连接引擎，不能宣称运行成功。',
  project: '正式版复用现有工作区选择器，并检查 project.godot。此处未读取本地目录。',
  assets: '资源与技能页面属于后续规划；首版先复用已有技能与 MCP 能力。',
  history: '此项仅示意同一游戏项目下的历史会话；当前可体验的是二段跳示例。',
  settings: '正式版复用已有设置页面，管理模型、凭据和 Godot 路径。',
  attach: '正式版复用原生附件与上下文选择能力。此原型不会上传文件。',
  mode: '正式版沿用 Harness 的审批和权限机制，不在工作台中另建执行权限。',
  model: '正式版读取用户已配置的模型；原型没有预设已连接的模型。'
}
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.action === 'new') {
    showView('overview')
    $('#idea').focus()
  } else notify(actions[button.dataset.action])
}))
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
  $('#idea').value = button.dataset.prompt
  $('#idea').focus()
}))
function appendMessage(value) {
  const message = document.createElement('div')
  message.className = 'user-message'
  message.textContent = value
  const result = document.createElement('p')
  result.className = 'agent-footnote'
  result.textContent = '原型已接收这段输入；没有调用模型、执行工具或修改项目文件。'
  $('#messages').append(message, result)
  message.scrollIntoView({ block: 'nearest' })
}
$('#start-task').addEventListener('click', () => {
  const value = $('#idea').value.trim()
  if (!value) { $('#idea').focus(); notify('先写下你想完成的任务。'); return }
  showView('session')
  appendMessage(value)
  $('#idea').value = ''
  $('#reply').focus()
})
$('#composer').addEventListener('submit', event => {
  event.preventDefault()
  const value = $('#reply').value.trim()
  if (!value) { $('#reply').focus(); return }
  appendMessage(value)
  $('#reply').value = ''
})
const fileContents = {
  'player.gd': '# 示例文件入口，不是完整可执行脚本\nextends CharacterBody2D\n\nvar jump_count := 0\nconst MAX_JUMPS := 2',
  'player.tscn': '; 示例场景结构\nPlayer (CharacterBody2D)\n  ├─ Sprite2D\n  ├─ CollisionShape2D\n  └─ LandingParticles (GPUParticles2D)',
  'project.godot': '; 示例项目配置摘要\n项目名称：星岛漫游\n项目类型：2D 冒险\n输入动作：move_left / move_right / jump'
}
document.querySelectorAll('[data-file]').forEach(button => button.addEventListener('click', () => {
  $('#file-title').textContent = button.dataset.file
  $('#file-content').textContent = fileContents[button.dataset.file]
  $('#file-dialog').showModal()
}))
$('#close-file').addEventListener('click', () => $('#file-dialog').close())
document.querySelectorAll('.checklist input').forEach(input => input.addEventListener('change', () => {
  const count = document.querySelectorAll('.checklist input:checked').length
  $('#checklist-progress').textContent = `${count} / 4 项手动勾选 · 仅用于原型演示`
}))
if (matchMedia('(max-width: 900px)').matches) $('#inspector-toggle').setAttribute('aria-expanded', 'false')
