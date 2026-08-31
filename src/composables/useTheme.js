
import { ref, watch, onMounted } from 'vue'

const theme = ref('auto') // 'light' | 'dark' | 'auto'
const isDark = ref(false)

const THEME_KEY = 'bangumi-theme'

function applyDark(dark) {
  isDark.value = dark
  if (dark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

function resolveTheme() {
  if (theme.value === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return theme.value === 'dark'
}

// 在应用挂载前同步应用主题：避免首帧以错误主题渲染、挂载后再"突然变色"（液态玻璃下尤其突兀）
export function initTheme() {
  if (typeof document === 'undefined') return
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'auto') theme.value = saved
  } catch {}
  applyDark(resolveTheme())
}

export function useTheme() {
  onMounted(() => {
    // 兜底：确保与当前设置一致（重复应用无害）
    applyDark(resolveTheme())

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (theme.value === 'auto') applyDark(resolveTheme())
    }
    mq.addEventListener('change', handler)
  })

  watch(theme, (val) => {
    try {
      localStorage.setItem(THEME_KEY, val)
    } catch {}
    applyDark(resolveTheme())
  })

  const setTheme = (t) => { theme.value = t }
  const toggleTheme = () => {
    if (theme.value === 'light') theme.value = 'dark'
    else if (theme.value === 'dark') theme.value = 'auto'
    else theme.value = 'light'
  }

  return { theme, isDark, setTheme, toggleTheme }
}
