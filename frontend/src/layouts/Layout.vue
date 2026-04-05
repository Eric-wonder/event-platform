<template>
  <el-container class="layout-container">
    <el-aside width="220px" class="sidebar">
      <div class="logo">🏆 活动平台</div>
      <el-menu :default-active="$route.path" router class="sidebar-menu">

        <el-menu-item index="/activities"><span>活动列表</span></el-menu-item>
        <el-menu-item index="/my-registrations"><span>我的报名</span></el-menu-item>
        <el-menu-item index="/projects"><span>报名项目</span></el-menu-item>

        <el-menu-item v-if="isOrganizer" index="/activities/create"><span>发布活动</span></el-menu-item>

        <!-- 分销管理（ADMIN + 渠道管理员）-->
        <el-sub-menu v-if="isAdmin || isChannelManager" index="/distribution">
          <template #title>📊 分销管理</template>
          <el-menu-item v-if="isAdmin" index="/admin/channels">渠道管理</el-menu-item>
          <el-menu-item index="/commissions">佣金报表</el-menu-item>
        </el-sub-menu>

        <!-- 系统管理（ADMIN）-->
        <el-sub-menu v-if="isAdmin" index="/system">
          <template #title>⚙️ 系统管理</template>
          <el-menu-item index="/admin/projects">报名项目管理</el-menu-item>
          <el-menu-item index="/admin/users">用户管理</el-menu-item>
          <el-menu-item index="/dashboard">仪表盘</el-menu-item>
          <el-divider style="margin:4px 12px;border-color:#444" />
          <el-menu-item index="/admin/email-settings">📧 邮件设置</el-menu-item>
          <el-menu-item index="/admin/email-logs">📋 邮件日志</el-menu-item>
        </el-sub-menu>

        <el-menu-item index="/notifications">
          <span>通知</span>
          <el-badge :value="unreadCount" :hidden="!unreadCount" class="badge" />
        </el-menu-item>
      </el-menu>

      <!-- 用户信息 -->
      <div class="user-panel">
        <el-avatar :size="36" :src="userStore.userInfo?.avatar">
          {{ userStore.userInfo?.username?.[0]?.toUpperCase() }}
        </el-avatar>
        <div class="user-info">
          <div class="username">{{ userStore.userInfo?.username }}</div>
          <div class="role-tag">{{ roleLabel }}</div>
        </div>
        <el-button text @click="handleLogout" title="退出登录">
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="header-title">{{ pageTitle }}</div>
        <div class="header-actions">
          <el-button type="primary" @click="$router.push('/activities/create')" v-if="isOrganizer">
            发布活动
          </el-button>
        </div>
      </el-header>
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight } from '@element-plus/icons-vue'
import { useUserStore } from '../stores/user'
import { notificationApi } from '../api/client'

const router = useRouter()
const userStore = useUserStore()
const unreadCount = ref(0)

const isOrganizer = computed(() => ['ORGANIZER', 'ADMIN'].includes(userStore.userInfo?.role))
const isAdmin = computed(() => userStore.userInfo?.role === 'ADMIN')
const isChannelManager = computed(() => userStore.userInfo?.role === 'CHANNEL_MANAGER')

const roleLabelMap = { USER: '用户', ORGANIZER: '组织者', ADMIN: '管理员', CHANNEL_MANAGER: '渠道管理员' }
const roleLabel = computed(() => roleLabelMap[userStore.userInfo?.role] || '')

const pageTitleMap = {
  '/activities': '活动列表', '/my-registrations': '我的报名', '/notifications': '通知',
  '/admin/users': '用户管理', '/admin/channels': '渠道管理', '/commissions': '佣金报表',
  '/projects': '报名项目', '/admin/projects': '报名项目管理', '/dashboard': '仪表盘',
  '/admin/email-settings': '邮件设置', '/admin/email-logs': '邮件日志',
}
const pageTitle = computed(() => {
  const path = router.currentRoute.value.path
  return pageTitleMap[path] || ''
})

let timer
const fetchUnread = () => {
  notificationApi.unreadCount().then(res => { unreadCount.value = res.data?.count || 0 }).catch(() => {})
}

const handleLogout = () => {
  userStore.logout()
  router.push('/login')
}

onMounted(() => {
  fetchUnread()
  timer = setInterval(fetchUnread, 30000)
})
onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.layout-container { height: 100vh; }
.sidebar { background: #1a1a2e; display: flex; flex-direction: column; }
.logo { padding: 20px 16px; font-size: 18px; font-weight: bold; color: #fff; border-bottom: 1px solid #2a2a4a; }
.sidebar-menu { background: transparent; border: none; flex: 1; }
.sidebar-menu .el-menu-item { color: #ccc; border-radius: 8px; margin: 4px 8px; }
.sidebar-menu .el-menu-item:hover, .sidebar-menu .el-menu-item.is-active { background: #4a4a8a; color: #fff; }
.sidebar-menu :deep(.el-sub-menu__title) { color: #ccc; border-radius: 8px; margin: 4px 8px; }
.sidebar-menu :deep(.el-sub-menu .el-menu-item) { padding-left: 36px !important; }
.badge { margin-left: 8px; }
.user-panel { padding: 16px; border-top: 1px solid #2a2a4a; display: flex; align-items: center; gap: 10px; color: #ccc; }
.username { font-size: 13px; color: #fff; }
.role-tag { font-size: 11px; color: #aaa; }
.header { background: #fff; border-bottom: 1px solid #eee; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; }
.header-title { font-size: 18px; font-weight: 600; color: #333; }
.main-content { padding: 24px; background: #f5f7fa; }
</style>
