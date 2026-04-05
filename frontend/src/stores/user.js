import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '../api/client'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token') || '')
  const userInfo = ref(null)

  // 新增：role 快捷访问
  const role = computed(() => userInfo.value?.role || null)

  function restoreToken() {
    if (token.value) {
      authApi.getMe().then(res => {
        if (res.code === 0) userInfo.value = res.data
      }).catch(() => {
        logout()
      })
    }
  }

  function setToken(t) {
    token.value = t
    localStorage.setItem('token', t)
  }

  function setUser(info) {
    userInfo.value = info
  }

  function logout() {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem('token')
  }

  return { token, userInfo, role, restoreToken, setToken, setUser, logout }
})
