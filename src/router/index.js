import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/watching'
  },
  {
    path: '/watching',
    name: 'Watching',
    component: () => import('../views/WatchingView.vue'),
    meta: { title: '正在追番', icon: 'tv' }
  },
  {
    path: '/remaining',
    name: 'Remaining',
    component: () => import('../views/RemainingView.vue'),
    meta: { title: '等待更新', icon: 'clock' }
  },
  {
    path: '/watched',
    name: 'Watched',
    component: () => import('../views/WatchedView.vue'),
    meta: { title: '已看历史', icon: 'book' }
  },
  {
    path: '/import',
    name: 'Import',
    component: () => import('../views/ImportView.vue'),
    meta: { title: '导入Excel', icon: 'upload' }
  },
  // 以下两项原为顶栏按钮弹出的弹窗，按要求改为侧边导航中的独立页面
  {
    path: '/tags',
    name: 'Tags',
    component: () => import('../views/TagsView.vue'),
    meta: { title: '标签管理', icon: 'bookmark' }
  },
  {
    path: '/appearance',
    name: 'Appearance',
    component: () => import('../views/AppearanceView.vue'),
    meta: { title: '主题与背景', icon: 'palette' }
  },
  {
    // 导入与导出合并到同一页面：导入走系统文件对话框自动识别格式，导出需显式选择格式
    path: '/transfer',
    name: 'Transfer',
    component: () => import('../views/ImportExportView.vue'),
    meta: { title: '导入 & 导出', icon: 'swap' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
