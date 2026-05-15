import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/watching'
  },
  {
    path: '/watching',
    name: 'Watching',
    component: () => import('../views/WatchingView.vue'),
    meta: { title: '正在追番', icon: '📺' }
  },
  {
    path: '/remaining',
    name: 'Remaining',
    component: () => import('../views/RemainingView.vue'),
    meta: { title: '等待更新', icon: '⏳' }
  },
  {
    path: '/watched',
    name: 'Watched',
    component: () => import('../views/WatchedView.vue'),
    meta: { title: '已看历史', icon: '📚' }
  },
  {
    path: '/import',
    name: 'Import',
    component: () => import('../views/ImportView.vue'),
    meta: { title: '导入Excel', icon: '📥' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
