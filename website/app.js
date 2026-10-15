const menuButton = document.querySelector('#menu')
const navigation = document.querySelector('#navigation')

function closeMenu() {
  navigation.classList.remove('is-open')
  menuButton.setAttribute('aria-expanded', 'false')
  menuButton.setAttribute('aria-label', '打开导航菜单')
}

menuButton.addEventListener('click', () => {
  const isOpen = navigation.classList.toggle('is-open')
  menuButton.setAttribute('aria-expanded', String(isOpen))
  menuButton.setAttribute('aria-label', isOpen ? '关闭导航菜单' : '打开导航菜单')
})
navigation.addEventListener('click', (event) => {
  if (event.target.closest('a')) closeMenu()
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && navigation.classList.contains('is-open')) {
    closeMenu()
    menuButton.focus()
  }
})
document.querySelector('#dismiss').addEventListener('click', () => {
  document.querySelector('#announcement').hidden = true
})

const demos = {
  scene: {
    prompt: '帮我创建一个有树林和小机器人的游戏场景',
    answer: '好，让我们把这个小世界搭起来。',
    detail: '我会创建场景、添加角色，并整理项目结构。',
    tool: '创建游戏场景',
    files: ['＋ scenes/world.tscn', '＋ scripts/player.gd', '＋ scenes/player.tscn'],
    finish: '小世界准备好了。接下来，为它加点玩法？',
    counter: '01 / 03'
  },
  code: {
    prompt: '给小机器人添加移动和二段跳功能',
    answer: '先看看角色现有的移动逻辑。',
    detail: '结合输入映射，补上跳跃次数和落地重置。',
    tool: '编写角色脚本',
    files: ['✓ 读取 scripts/player.gd', '＋ 添加 jump_count 状态', '＋ 落地时重置跳跃次数'],
    finish: '脚本已更新。去 Godot 中试试跳跃手感吧。',
    counter: '02 / 03'
  },
  debug: {
    prompt: '机器人落地后无法再次跳跃，帮我排查一下',
    answer: '一起检查落地判断和状态更新。',
    detail: '查看角色脚本，定位跳跃计数没有重置的原因。',
    tool: '定位并修复问题',
    files: ['✓ 检查 is_on_floor() 判断', '✓ 调整状态更新顺序', '✓ 整理需要验证的操作'],
    finish: '改动已整理。请运行场景，验证连续跳跃。',
    counter: '03 / 03'
  }
}

document.querySelectorAll('[data-demo]').forEach((button) => {
  button.addEventListener('click', () => {
    const demo = demos[button.dataset.demo]
    if (!demo) return
    document.querySelectorAll('[data-demo]').forEach((item) => {
      const active = item === button
      item.classList.toggle('active', active)
      item.setAttribute('aria-pressed', String(active))
    })
    for (const key of ['prompt', 'answer', 'detail', 'tool', 'finish']) {
      document.querySelector(`#demo-${key}`).textContent = demo[key]
    }
    const files = document.querySelector('#demo-files')
    files.replaceChildren()
    demo.files.forEach((file, index) => {
      if (index) files.append(document.createElement('br'))
      files.append(document.createTextNode(file))
    })
    document.querySelector('.demo-counter').textContent = demo.counter
    document.querySelector('#demo-caption').textContent = demo.prompt
  })
})
