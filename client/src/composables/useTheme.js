
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

export function useTheme() {
  onMounted(() => {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved) theme.value = saved
    applyDark(resolveTheme())

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (theme.value === 'auto') applyDark(resolveTheme())
    }
    mq.addEventListener('change', handler)
  })

  watch(theme, (val) => {
    localStorage.setItem(THEME_KEY, val)
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
