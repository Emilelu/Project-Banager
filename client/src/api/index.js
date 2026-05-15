import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

// ========== 追番 API ==========

export const watchingApi = {
  getAll: () => api.get('/watching'),
  getByDay: (day) => api.get(`/watching/${day}`),
  add: (data) => api.post('/watching', data),
  update: (id, data) => api.put(`/watching/${id}`, data),
  delete: (id) => api.delete(`/watching/${id}`),
  increment: (id) => api.post(`/watching/${id}/increment`),
  decrement: (id) => api.post(`/watching/${id}/decrement`),
  moveToRemaining: (id) => api.post(`/watching/${id}/to-remaining`),
  moveToWatched: (id, watchDate) => api.post(`/watching/${id}/to-watched`, { watch_date: watchDate })
}

// ========== 等番 API ==========

export const remainingApi = {
  getAll: () => api.get('/remaining'),
  add: (data) => api.post('/remaining', data),
  update: (id, data) => api.put(`/remaining/${id}`, data),
  delete: (id) => api.delete(`/remaining/${id}`),
  moveToWatching: (id, data) => api.post(`/remaining/${id}/to-watching`, data)
}

// ========== 已看 API ==========

export const watchedApi = {
  getAll: () => api.get('/watched'),
  getByYear: (year) => api.get(`/watched/year/${year}`),
  add: (data) => api.post('/watched', data),
  update: (id, data) => api.put(`/watched/${id}`, data),
  delete: (id) => api.delete(`/watched/${id}`)
}

// ========== 已看年份 API ==========

export const watchedYearsApi = {
  getAll: () => api.get('/watched-years'),
  add: (data) => api.post('/watched-years', data),
  update: (id, data) => api.put(`/watched-years/${id}`, data),
  delete: (id) => api.delete(`/watched-years/${id}`)
}

// ========== 批量操作 API ==========

export const batchApi = {
  batchDeleteWatching: (ids) => api.post('/watching/batch-delete', { ids }),
  batchDeleteRemaining: (ids) => api.post('/remaining/batch-delete', { ids }),
  batchDeleteWatched: (ids) => api.post('/watched/batch-delete', { ids }),
  clearWatching: () => api.post('/clear/watching'),
  clearRemaining: () => api.post('/clear/remaining'),
  clearWatched: () => api.post('/clear/watched'),
  clearWatchedYears: () => api.post('/clear/watched-years'),
  clearAll: () => api.post('/clear/all')
}

// ========== 导入 API ==========

export const importApi = {
  upload: (formData) => api.post('/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export default api
