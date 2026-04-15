import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res.data,
  err => {
    if (!err.response) { ElMessage.error('网络错误，请检查网络连接'); return Promise.reject(err) }
    const { status, data } = err.response
    const msg = data?.message || '请求失败'
    if (status === 401) {
      localStorage.removeItem('token')
      router.push('/login')
      ElMessage.error('登录已过期，请重新登录')
    } else if (status === 403) {
      ElMessage.error(msg || '权限不足')
    } else if (status === 429) {
      ElMessage.error('请求过于频繁，请稍后再试')
    } else {
      ElMessage.error(msg)
    }
    return Promise.reject(err)
  }
)

export default api

export const authApi = {
  register: data => api.post('/auth/register', data),
  login: data => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  updateMe: data => api.put('/auth/me', data),
}

export const activityApi = {
  list: params => api.get('/activities', { params }),
  detail: id => api.get(`/activities/${id}`),
  create: data => api.post('/activities', data),
  update: (id, data) => api.put(`/activities/${id}`, data),
  delete: id => api.delete(`/activities/${id}`),
  updateStatus: (id, status) => api.patch(`/activities/${id}/status`, { status }),
  registrations: (id, params) => api.get(`/activities/${id}/registrations`, { params }),
  export: id => api.get(`/activities/${id}/export`, { responseType: 'blob' }),
}

export const registrationApi = {
  register: (activityId, data) => api.post(`/registrations/activities/${activityId}/register`, data),
  cancel: activityId => api.delete(`/registrations/activities/${activityId}/register`),
  mine: params => api.get('/registrations/mine', { params }),
  detail: id => api.get(`/registrations/${id}`),
  updateStatus: (id, status) => api.patch(`/registrations/${id}/status`, { status }),
}

export const notificationApi = {
  list: params => api.get('/notifications', { params }),
  unreadCount: () => api.get('/notifications/unread-count'),
  markRead: id => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
}

export const uploadApi = {
  image: formData => api.post('/upload/image', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  file: formData => api.post('/upload/file', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  remove: url => api.delete('/upload/file', { data: { url } }),
}

export const adminApi = {
  users: params => api.get('/admin/users', { params }),
  userDetail: id => api.get(`/admin/users/${id}`),
  updateRole: (id, role) => api.patch(`/admin/users/${id}/role`, { role }),
  resetPassword: (id, password) => api.post(`/admin/users/${id}/reset-password`, { newPassword: password }),
  ban: id => api.patch(`/admin/users/${id}/ban`),
  unban: id => api.patch(`/admin/users/${id}/unban`),
  stats: () => api.get('/admin/stats'),
}

// ─── 报名项目接口 ──────────────────────────────────────────
export const projectApi = {
  list: params => api.get('/projects', { params }),
  detail: id => api.get(`/projects/${id}`),
  create: data => api.post('/projects', data),
  update: (id, data) => api.put(`/projects/${id}`, data),
  delete: id => api.delete(`/projects/${id}`),
  registrations: (id, params) => api.get(`/projects/${id}/registrations`, { params }),
  updateRegStatus: (projectId, regId, status) => api.patch(`/projects/${projectId}/registrations/${regId}/status`, { status }),
}

// ─── 项目表单字段接口 ──────────────────────────────────────
export const fieldApi = {
  list: projectId => api.get(`/projects/${projectId}/fields`),
  create: (projectId, data) => api.post(`/projects/${projectId}/fields`, data),
  update: (projectId, fieldId, data) => api.put(`/projects/${projectId}/fields/${fieldId}`, data),
  delete: (projectId, fieldId) => api.delete(`/projects/${projectId}/fields/${fieldId}`),
  batchSave: (projectId, fields) => api.post(`/projects/${projectId}/fields/batch`, { fields }),
}

// ─── 用户报名接口 ─────────────────────────────────────────
export const regApi = {
  submit: (projectId, data) => api.post(`/projects/${projectId}/register`, data),
  mine: () => api.get('/projects/register/mine'),
  mineAll: () => api.get('/projects/register/mine'),
  cancel: projectId => api.delete(`/projects/${projectId}/register/mine`),
}

// ─── 渠道接口 ─────────────────────────────────────────────
export const channelApi = {
  list: params => api.get('/channels', { params }),
  detail: id => api.get(`/channels/${id}`),
  create: data => api.post('/channels', data),
  update: (id, data) => api.put(`/channels/${id}`, data),
  delete: id => api.delete(`/channels/${id}`),
  addAdmin: (channelId, data) => api.post(`/channels/${channelId}/admins`, data),
  removeAdmin: (channelId, userId) => api.delete(`/channels/${channelId}/admins/${userId}`),
}

// ─── 佣金接口 ─────────────────────────────────────────────
export const commissionApi = {
  list: params => api.get('/commissions', { params }),
  summary: () => api.get('/commissions/summary'),
  settle: ids => api.post('/commissions/settle', { ids }),
  preview: (price, channel) => api.post('/commissions/preview', { price, channel }),
}

// ─── Excel 导出接口 ────────────────────────────────────────
export const exportApi = {
  projectRegistrations: (projectId) => api.get(`/export/projects/${projectId}/registrations`, {
    responseType: 'blob',
    headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  }),
}

// ─── 邮件接口 ─────────────────────────────────────────────
export const emailApi = {
  getSettings: () => api.get('/email/settings'),
  saveSettings: data => api.put('/email/settings', data),
  saveSmtpEnv: data => api.put('/email/smtp-env', data),
  sendTest: to => api.post('/email/test', { to }),
  sendProject: (projectId, extraEmails) => api.post(`/email/send-project/${projectId}`, { extraEmails }),
  logs: params => api.get('/email/logs', { params }),
}

// ─── 微信支付接口 ─────────────────────────────────────────
export const payApi = {
  // 创建扫码支付订单，返回 codeUrl + qrImage
  createNative: data => api.post('/pay/native', data),
  // 创建 JSAPI 支付订单（需 openid）
  createJsapi: data => api.post('/pay/jsapi', data),
  // 查询支付状态（轮询用）
  status: outTradeNo => api.get(`/pay/status/${outTradeNo}`),
  // 获取二维码图片
  qrImage: outTradeNo => api.get(`/pay/qr/${outTradeNo}`, { responseType: 'blob' }),
  // 关闭订单
  close: outTradeNo => api.post(`/pay/close/${outTradeNo}`),
  // 当前用户支付订单列表
  orders: params => api.get('/pay/orders', { params }),
}

// ─── 网站设置接口 ─────────────────────────────────────────
export const siteApi = {
  get: () => api.get('/site'),
  save: data => api.put('/site', data),
}

// ─── 公开报名接口（无需登录）───────────────────────────────
export const publicRegApi = {
  getProject: (id) => api.get(`/projects/${id}`),
  submit: (projectId, data) => api.post(`/public/register/${projectId}`, data),
  checkStatus: (projectId, phone) => api.get(`/public/register/${projectId}/status`, { params: { phone } }),
  list: (projectId, params) => api.get(`/public/${projectId}/registrations`, { params }),
  updateStatus: (projectId, regId, status) => api.patch(`/public/${projectId}/registrations/${regId}/status`, { status }),
}
