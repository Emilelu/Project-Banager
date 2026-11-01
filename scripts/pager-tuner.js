/* ============================================================================
 * 分页栏实时调参器（F12 控制台粘贴即用）
 *
 * 用途：在你浏览器里直接拖动滑块改分页栏的宽/高/圆角/字号/内距，
 *       实时看到效果，找到满意数值后点「复制配置」把它发给我，
 *       我再把数值落进 style.css（这样刷新也不会丢）。
 *
 * 用法：
 *   1. 打开有分页的页面（「等待更新」或「已看历史」，且数据 > 20 条）
 *   2. F12 → Console → 粘贴本文件全部内容 → 回车
 *   3. 右上角出现面板，拖滑块实时生效
 *   4. 满意后点「复制配置」，把复制的 JSON 贴给我
 *   5. 想撤销：点「重置」或刷新页面
 *
 * 说明：
 *   · 本脚本只改当前页面的内存样式（inline style），不动源码，刷新即恢复
 *   · 不依赖任何库，纯原生 JS
 * ========================================================================== */
;(() => {
  'use strict'

  const HOST = 'pbm-pager-tuner'
  const old = document.getElementById(HOST)
  if (old) old.remove()

  /* ---------------------------- 1. 定位目标元素 ---------------------------- */
  function findTargets() {
    const btns = Array.from(document.querySelectorAll('button'))

    // 每页 N 条 触发器
    const sizeBtn =
      btns.find((b) => b.classList.contains('page-size-trigger')) ||
      btns.find((b) => (b.textContent || '').indexOf('\u6bcf\u9875') !== -1) // 每页

    // 分页卡片（含触发器的那张 .glass）
    const card = sizeBtn ? sizeBtn.closest('.glass') : null

    // 页码 / 上下页按钮
    let pagerBtns = Array.from(document.querySelectorAll('.pager-btn'))
    if (!pagerBtns.length) {
      // 兜底：按 aria-label 找上下页，再找纯数字按钮
      pagerBtns = btns.filter((b) => {
        const al = b.getAttribute('aria-label') || ''
        const tx = (b.textContent || '').trim()
        if (/\u4e0a\u4e00\u9875|\u4e0b\u4e00\u9875/.test(al)) return true // 上一页 / 下一页
        if (/^\d+$/.test(tx) && b.classList.contains('btn-icon')) return true
        return false
      })
    }

    const group = pagerBtns.length ? pagerBtns[0].parentElement : null
    return { sizeBtn, card, pagerBtns, group }
  }

  const T = findTargets()
  if (!T.sizeBtn || !T.card) {
    alert(
      '\u672a\u627e\u5230\u5206\u9875\u680f\n\n' +
        '\u8bf7\u5148\u5207\u5230\u300c\u7b49\u5f85\u66f4\u65b0\u300d\u6216\u300c\u5df2\u770b\u5386\u53f2\u300d\u9875\u9762\uff0c' +
        '\u5e76\u786e\u4fdd\u6570\u636e\u8d85\u8fc7 20 \u6761\uff08\u5426\u5219\u4e0d\u4f1a\u51fa\u73b0\u5206\u9875\u680f\uff09\u3002',
    )
    return
  }

  /* ---------------------------- 2. 参数表 ---------------------------- */
  // sel: size=每页触发器 / pager=页码按钮 / card=卡片 / group=按钮组
  const SPEC = [
    { g: '\u6bcf\u9875 N \u6761', sel: 'size', key: 'ppW', label: '\u5bbd width', prop: 'width', unit: 'px', min: 80, max: 280, step: 1, def: 150 },
    { g: '\u6bcf\u9875 N \u6761', sel: 'size', key: 'ppH', label: '\u9ad8 height', prop: 'height', unit: 'px', min: 10, max: 96, step: 1, def: 80 },
    { g: '\u6bcf\u9875 N \u6761', sel: 'size', key: 'ppR', label: '\u5706\u89d2 radius', prop: 'border-radius', unit: 'px', min: 0, max: 40, step: 1, def: 16 },
    { g: '\u6bcf\u9875 N \u6761', sel: 'size', key: 'ppFs', label: '\u5b57\u53f7 font-size', prop: 'font-size', unit: 'px', min: 9, max: 24, step: 0.5, def: 16 },
    { g: '\u6bcf\u9875 N \u6761', sel: 'size', key: 'ppPx', label: '\u5de6\u53f3\u5185\u8ddd', prop: 'padding-x', unit: 'px', min: 0, max: 40, step: 1, def: 16 },
    { g: '\u6bcf\u9875 N \u6761', sel: 'size', key: 'ppGap', label: '\u5185\u90e8 gap', prop: 'gap', unit: 'px', min: 0, max: 24, step: 0.5, def: 8 },

    { g: '\u9875\u7801 / \u4e0a\u4e0b\u9875', sel: 'pager', key: 'pgW', label: '\u5bbd width', prop: 'width', unit: 'px', min: 6, max: 64, step: 1, def: 30 },
    { g: '\u9875\u7801 / \u4e0a\u4e0b\u9875', sel: 'pager', key: 'pgH', label: '\u9ad8 height', prop: 'height', unit: 'px', min: 6, max: 64, step: 1, def: 35 },
    { g: '\u9875\u7801 / \u4e0a\u4e0b\u9875', sel: 'pager', key: 'pgR', label: '\u5706\u89d2 radius', prop: 'border-radius', unit: 'px', min: 0, max: 32, step: 1, def: 8 },
    { g: '\u9875\u7801 / \u4e0a\u4e0b\u9875', sel: 'pager', key: 'pgFs', label: '\u5b57\u53f7 font-size', prop: 'font-size', unit: 'px', min: 8, max: 20, step: 0.5, def: 10.5 },

    { g: '\u5206\u9875\u5361\u7247', sel: 'card', key: 'cdPy', label: '\u4e0a\u4e0b\u5185\u8ddd', prop: 'padding-y', unit: 'px', min: 0, max: 48, step: 1, def: 7 },
    { g: '\u5206\u9875\u5361\u7247', sel: 'card', key: 'cdPx', label: '\u5de6\u53f3\u5185\u8ddd', prop: 'padding-x', unit: 'px', min: 0, max: 64, step: 1, def: 21 },
    { g: '\u5206\u9875\u5361\u7247', sel: 'card', key: 'cdR', label: '\u5706\u89d2 radius', prop: 'border-radius', unit: 'px', min: 0, max: 40, step: 1, def: 14 },

    { g: '\u6309\u94ae\u7ec4', sel: 'group', key: 'grGap', label: '\u6309\u94ae\u95f4\u8ddd', prop: 'gap', unit: 'px', min: 0, max: 24, step: 0.5, def: 3.5 },
  ]

  const values = {}
  SPEC.forEach((s) => {
    values[s.key] = s.def
  })

  /* ---------------------------- 3. 应用样式 ---------------------------- */
  function resolve(sel) {
    if (sel === 'size') return T.sizeBtn ? [T.sizeBtn] : []
    if (sel === 'pager') return T.pagerBtns
    if (sel === 'card') return T.card ? [T.card] : []
    if (sel === 'group') return T.group ? [T.group] : []
    return []
  }

  function apply(spec, val) {
    const els = resolve(spec.sel)
    els.forEach((el) => {
      if (spec.prop === 'padding-x') {
        el.style.setProperty('padding-left', val + 'px', 'important')
        el.style.setProperty('padding-right', val + 'px', 'important')
      } else if (spec.prop === 'padding-y') {
        el.style.setProperty('padding-top', val + 'px', 'important')
        el.style.setProperty('padding-bottom', val + 'px', 'important')
      } else if (spec.prop === 'width' && spec.sel === 'pager') {
        // 页码按钮同时设 min-width，否则可能被 flex 压缩
        el.style.setProperty('width', val + 'px', 'important')
        el.style.setProperty('min-width', val + 'px', 'important')
        el.style.setProperty('flex', '0 0 auto', 'important')
      } else if (spec.prop === 'height') {
        /*
         * 关键：只设 height 是压不下去的。
         *
         * 实测：pager-btn 设 height:12px 后实际仍是 29.75px ——
         * 因为按钮里还有图标（16px）和文字（font-size + line-height），
         * CSS 的 height 只是「理想值」，内容撑不开时会被内容撑高。
         *
         * 所以设高度时必须同时：
         *   · min-height: 0    解除下限
         *   · line-height: 1   避免行高撑出额外空间
         *   · overflow: hidden 内容超出时裁掉，而不是撑高盒子
         *   · box-sizing: border-box 让 height 含边框
         *   · padding-top/bottom: 0   避免内距叠加
         */
        el.style.setProperty('height', val + 'px', 'important')
        el.style.setProperty('min-height', '0', 'important')
        el.style.setProperty('max-height', 'none', 'important')
        el.style.setProperty('line-height', '1', 'important')
        el.style.setProperty('overflow', 'hidden', 'important')
        el.style.setProperty('box-sizing', 'border-box', 'important')
        el.style.setProperty('padding-top', '0', 'important')
        el.style.setProperty('padding-bottom', '0', 'important')
        el.style.setProperty('flex', '0 0 auto', 'important')
        // 图标本身也不能超过盒高，否则仍会溢出
        const icons = el.querySelectorAll('svg, .app-icon')
        const iconSize = Math.max(8, Math.min(20, Math.round(val * 0.5)))
        icons.forEach((ic) => {
          ic.style.setProperty('width', iconSize + 'px', 'important')
          ic.style.setProperty('height', iconSize + 'px', 'important')
          ic.style.setProperty('flex', '0 0 auto', 'important')
        })
      } else {
        el.style.setProperty(spec.prop, val + spec.unit, 'important')
      }
    })
  }

  function applyAll() {
    SPEC.forEach((s) => apply(s, values[s.key]))
    refreshReadout()
  }

  /* ---------------------------- 4. 面板 UI ---------------------------- */
  const dark =
    document.documentElement.classList.contains('dark') ||
    document.body.classList.contains('dark')

  const CSS = `
#${HOST} {
  position: fixed; top: 12px; right: 12px; z-index: 99999;
  width: 336px; max-height: 86vh; display: flex; flex-direction: column;
  font: 12px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: ${dark ? '#e5e7eb' : '#1f2937'};
  background: ${dark ? 'rgba(24,18,44,0.94)' : 'rgba(255,255,255,0.94)'};
  border: 1px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)'};
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0,0,0,${dark ? '0.6' : '0.22'});
  backdrop-filter: blur(14px);
  overflow: hidden;
}
#${HOST} header {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 10px; cursor: move; user-select: none;
  border-bottom: 1px solid ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'};
  font-weight: 700; font-size: 12.5px;
}
#${HOST} header .hint { font-weight: 400; opacity: .55; font-size: 10.5px; }
#${HOST} header .sp { flex: 1; }
#${HOST} header button {
  border: 0; background: transparent; color: inherit; cursor: pointer;
  font-size: 15px; line-height: 1; padding: 2px 6px; border-radius: 6px;
}
#${HOST} header button:hover { background: ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)'}; }
#${HOST} .body { overflow: auto; padding: 8px 10px 4px; }
#${HOST} .group { margin: 8px 0 4px; font-weight: 700; font-size: 11px; opacity: .75;
  text-transform: uppercase; letter-spacing: .04em; }
#${HOST} .group:first-child { margin-top: 0; }
#${HOST} .row { display: grid; grid-template-columns: 84px 1fr 46px;
  align-items: center; gap: 6px; margin: 3px 0; }
#${HOST} .row label { font-size: 11px; opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${HOST} .row input[type=range] { width: 100%; height: 16px; accent-color: #7c3aed; }
#${HOST} .row input[type=number] {
  width: 100%; box-sizing: border-box; padding: 2px 4px; font-size: 11px;
  border: 1px solid ${dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)'};
  border-radius: 5px; background: ${dark ? 'rgba(255,255,255,0.08)' : '#fff'};
  color: inherit; text-align: right;
}
#${HOST} footer {
  display: flex; gap: 6px; padding: 8px 10px;
  border-top: 1px solid ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'};
}
#${HOST} footer button {
  flex: 1; padding: 6px 8px; border-radius: 7px; cursor: pointer;
  font-size: 11.5px; font-weight: 600; color: inherit;
  border: 1px solid ${dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.14)'};
  background: ${dark ? 'rgba(255,255,255,0.08)' : '#fff'};
}
#${HOST} footer button:hover { background: ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.04)'}; }
#${HOST} footer button.primary { background: #7c3aed; color: #fff; border-color: #7c3aed; }
#${HOST} footer button.primary:hover { background: #6d28d9; }
#${HOST} .readout { margin-top: 6px; padding: 6px 8px; border-radius: 7px;
  font-size: 10.5px; line-height: 1.6; opacity: .9;
  background: ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'};
  font-variant-numeric: tabular-nums; white-space: pre; }
`

  const styleEl = document.createElement('style')
  styleEl.textContent = CSS
  document.head.appendChild(styleEl)

  const box = document.createElement('div')
  box.id = HOST

  // ---- header ----
  const header = document.createElement('header')
  header.innerHTML =
    '<span>Pager Tuner</span><span class="hint">\u62d6\u6ed1\u5757\u5b9e\u65f6\u751f\u6548</span>' +
    '<span class="sp"></span><button data-act="close" title="\u5173\u95ed">\u00d7</button>'
  box.appendChild(header)

  // ---- body ----
  const body = document.createElement('div')
  body.className = 'body'

  let lastGroup = ''
  SPEC.forEach((s) => {
    if (s.g !== lastGroup) {
      lastGroup = s.g
      const gh = document.createElement('div')
      gh.className = 'group'
      gh.textContent = s.g
      body.appendChild(gh)
    }

    const row = document.createElement('div')
    row.className = 'row'

    const lab = document.createElement('label')
    lab.textContent = s.label
    lab.title = s.label

    const rng = document.createElement('input')
    rng.type = 'range'
    rng.min = s.min
    rng.max = s.max
    rng.step = s.step
    rng.value = values[s.key]

    const num = document.createElement('input')
    num.type = 'number'
    num.min = s.min
    num.max = s.max
    num.step = s.step
    num.value = values[s.key]

    const sync = (v) => {
      let n = parseFloat(v)
      if (!isFinite(n)) n = s.def
      n = Math.min(s.max, Math.max(s.min, n))
      values[s.key] = n
      rng.value = n
      num.value = n
      apply(s, n)
      refreshReadout()
    }

    rng.addEventListener('input', () => sync(rng.value))
    num.addEventListener('input', () => sync(num.value))

    row.appendChild(lab)
    row.appendChild(rng)
    row.appendChild(num)
    body.appendChild(row)
  })

  // ---- 实测读数 ----
  const readout = document.createElement('div')
  readout.className = 'readout'
  body.appendChild(readout)
  box.appendChild(body)

  // ---- footer ----
  const footer = document.createElement('footer')
  footer.innerHTML =
    '<button data-act="reset">\u91cd\u7f6e</button>' +
    '<button data-act="export" class="primary">\u590d\u5236\u914d\u7f6e</button>'
  box.appendChild(footer)

  document.body.appendChild(box)

  /* ---------------------------- 5. 实测读数 ---------------------------- */
  function px(n) {
    return Math.round(n * 100) / 100
  }

  function refreshReadout() {
    const sz = T.sizeBtn.getBoundingClientRect()
    const cd = T.card.getBoundingClientRect()
    const pg = T.pagerBtns.length ? T.pagerBtns[0].getBoundingClientRect() : null
    const lines = [
      '\u5206\u9875\u5361\u7247  ' + px(cd.width) + ' \u00d7 ' + px(cd.height),
      '\u6bcf\u9875 N \u6761   ' + px(sz.width) + ' \u00d7 ' + px(sz.height) +
        '   \u6bd4 ' + (sz.height ? px(sz.width / sz.height) : '-'),
    ]
    if (pg) {
      lines.push(
        '\u9875\u7801\u6309\u94ae   ' + px(pg.width) + ' \u00d7 ' + px(pg.height) +
          '   \u6bd4 ' + (pg.height ? px(pg.width / pg.height) : '-'),
      )
    }
    readout.textContent = lines.join('\n')
  }

  /* ---------------------------- 6. 交互 ---------------------------- */
  // 关闭
  box.querySelector('[data-act="close"]').addEventListener('click', () => {
    box.remove()
    styleEl.remove()
  })

  // 重置
  footer.querySelector('[data-act="reset"]').addEventListener('click', () => {
    T.sizeBtn.style.cssText = ''
    T.card.style.cssText = ''
    T.pagerBtns.forEach((b) => {
      b.style.cssText = ''
    })
    if (T.group) T.group.style.cssText = ''
    SPEC.forEach((s) => {
      values[s.key] = s.def
    })
    body.querySelectorAll('input[type=range]').forEach((el, i) => {
      el.value = SPEC[i].def
    })
    body.querySelectorAll('input[type=number]').forEach((el, i) => {
      el.value = SPEC[i].def
    })
    refreshReadout()
  })

  // 复制配置
  footer.querySelector('[data-act="export"]').addEventListener('click', () => {
    const out = {
      note: '\u628a\u8fd9\u6bb5\u53d1\u7ed9 AI\uff0c\u5b83\u4f1a\u843d\u8fdb style.css',
      measured: {
        card: {
          w: px(T.card.getBoundingClientRect().width),
          h: px(T.card.getBoundingClientRect().height),
        },
        perPage: {
          w: px(T.sizeBtn.getBoundingClientRect().width),
          h: px(T.sizeBtn.getBoundingClientRect().height),
        },
        pagerBtn: T.pagerBtns.length
          ? {
              w: px(T.pagerBtns[0].getBoundingClientRect().width),
              h: px(T.pagerBtns[0].getBoundingClientRect().height),
            }
          : null,
      },
      params: Object.assign({}, values),
    }
    const text = JSON.stringify(out, null, 2)
    /* eslint-disable no-console */
    console.log('[PagerTuner] \u914d\u7f6e\uff1a\n' + text)

    const done = () => {
      footer.querySelector('[data-act="export"]').textContent = '\u5df2\u590d\u5236 \u2713'
      setTimeout(() => {
        footer.querySelector('[data-act="export"]').textContent = '\u590d\u5236\u914d\u7f6e'
      }, 1400)
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => {
        window.prompt('\u81ea\u52a8\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u624b\u52a8\u590d\u5236\uff1a', text)
      })
    } else {
      window.prompt('\u8bf7\u624b\u52a8\u590d\u5236\uff1a', text)
    }
  })

  // 拖动面板
  ;(function drag() {
    let sx = 0
    let sy = 0
    let ox = 0
    let oy = 0
    let on = false
    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return
      on = true
      sx = e.clientX
      sy = e.clientY
      const r = box.getBoundingClientRect()
      ox = r.left
      oy = r.top
      e.preventDefault()
    })
    window.addEventListener('mousemove', (e) => {
      if (!on) return
      box.style.left = ox + (e.clientX - sx) + 'px'
      box.style.top = oy + (e.clientY - sy) + 'px'
      box.style.right = 'auto'
    })
    window.addEventListener('mouseup', () => {
      on = false
    })
  })()

  /* ---------------------------- 7. 启动 ---------------------------- */
  applyAll()
  console.log(
    '[PagerTuner] \u5df2\u542f\u52a8\u3002\u62d6\u6ed1\u5757\u5b9e\u65f6\u751f\u6548\uff0c' +
      '\u70b9\u300c\u590d\u5236\u914d\u7f6e\u300d\u628a\u6570\u503c\u53d1\u7ed9 AI\u3002',
  )
})()
