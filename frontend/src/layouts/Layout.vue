<template>
  <el-container class="layout-container">
    <!-- 移动端遮罩 -->
    <div v-if="isMobile && !isCollapse" class="mobile-mask" @click="isCollapse = true"></div>
    
    <!-- 侧边栏 -->
    <el-aside :width="isMobile ? '0px' : (isCollapse ? '64px' : '220px')" class="sidebar" :class="{ 'sidebar-mobile': isMobile, 'sidebar-open': isMobile && !isCollapse }">
      <div class="logo">
        <img v-if="siteLogo" :src="siteLogo" class="logo-img" />
        <span v-else-if="!isCollapse || isMobile">🏆 {{ siteName }}</span>
        <span v-else>🏆</span>
      </div>
      <el-menu :default-active="$route.path" router class="sidebar-menu" :collapse="!isMobile && isCollapse">

        <el-menu-item index="/projects"><span>报名项目</span></el-menu-item>

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
          <el-menu-item index="/admin/site-settings">🌐 网站设置</el-menu-item>
        </el-sub-menu>

        <el-menu-item index="/notifications">
          <span>通知</span>
          <el-badge :value="unreadCount" :hidden="!unreadCount" class="badge" />
        </el-menu-item>
      </el-menu>

      <!-- 用户信息 -->
      <div class="user-panel" v-if="!isMobile || !isCollapse">
        <el-avatar :size="36" :src="userStore.userInfo?.avatar">
          {{ userStore.userInfo?.username?.[0]?.toUpperCase() }}
        </el-avatar>
        <div class="user-info" v-if="!isCollapse || isMobile">
          <div class="username">{{ userStore.userInfo?.username }}</div>
          <div class="role-tag">{{ roleLabel }}</div>
        </div>
        <el-button text @click="handleLogout" title="退出登录" v-if="!isCollapse || isMobile">
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
    </el-aside>

    <el-container class="main-container">
      <el-header class="header">
        <!-- 移动端菜单按钮 -->
        <el-button v-if="isMobile" text @click="isCollapse = false" class="menu-btn">
          <el-icon size="24"><Menu /></el-icon>
        </el-button>
        <!-- PC端折叠按钮 -->
        <el-button v-else text @click="isCollapse = !isCollapse" class="menu-btn">
          <el-icon size="20"><Fold v-if="!isCollapse" /><Expand v-else /></el-icon>
        </el-button>
        <div class="header-title">{{ pageTitle }}</div>
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
import { ArrowRight, Menu, Fold, Expand } from '@element-plus/icons-vue'
import { useUserStore } from '../stores/user'
import { notificationApi, siteApi } from '../api/client'

const router = useRouter()
const userStore = useUserStore()
const unreadCount = ref(0)
const isCollapse = ref(false)
const isMobile = ref(false)
const siteName = ref('活动平台')
const siteLogo = ref('')

const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
  if (isMobile.value) isCollapse.value = true
}

const isAdmin = computed(() => userStore.userInfo?.role === 'ADMIN')
const isChannelManager = computed(() => userStore.userInfo?.role === 'CHANNEL_MANAGER')

const roleLabelMap = { USER: '用户', ORGANIZER: '组织者', ADMIN: '管理员', CHANNEL_MANAGER: '渠道管理员' }
const roleLabel = computed(() => roleLabelMap[userStore.userInfo?.role] || '')

const pageTitleMap = {
  '/projects': '报名项目', '/my-registrations': '我的报名', '/notifications': '通知',
  '/admin/users': '用户管理', '/admin/channels': '渠道管理', '/commissions': '佣金报表',
  '/admin/projects': '报名项目管理', '/dashboard': '仪表盘',
  '/admin/email-settings': '邮件设置', '/admin/email-logs': '邮件日志',
  '/admin/site-settings': '网站设置',
}
const pageTitle = computed(() => {
  const path = router.currentRoute.value.path
  return pageTitleMap[path] || ''
})

let timer
const fetchUnread = () => {
  notificationApi.unreadCount().then(res => { unreadCount.value = res.data?.count || 0 }).catch(() => {})
}

const fetchSiteSettings = () => {
  siteApi.get().then(res => {
    if (res.data?.siteName) siteName.value = res.data.siteName
    if (res.data?.siteLogo) siteLogo.value = res.data.siteLogo
  }).catch(() => {})
}

const handleLogout = () => {
  userStore.logout()
  router.push('/login')
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  fetchUnread()
  fetchSiteSettings()
  timer = setInterval(fetchUnread, 30000)
  
  // 监听网站设置更新
  window.addEventListener('site-settings-updated', fetchSiteSettings)
})
onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  clearInterval(timer)
})
</script>

<style scoped>
.layout-container { height: 100vh; }

/* 侧边栏 */
.sidebar { 
  background: #1a1a2e; 
  display: flex; 
  flex-direction: column; 
  transition: width 0.3s;
  overflow: hidden;
}
.sidebar-mobile {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 1000;
  width: 220px !important;
  transform: translateX(-100%);
  transition: transform 0.3s;
}
.sidebar-mobile.sidebar-open {
  transform: translateX(0);
}
.mobile-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 999;
}
.logo { 
  padding: 20px 16px; 
  font-size: 18px; 
  font-weight: bold; 
  color: #fff; 
  border-bottom: 1px solid #2a2a4a; 
  white-space: nowrap;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 8px;
}
.logo-img { height: 28px; width: auto; object-fit: contain; }
.sidebar-menu { background: transparent; border: none; flex: 1; }
.sidebar-menu .el-menu-item { color: #ccc; border-radius: 8px; margin: 4px 8px; }
.sidebar-menu .el-menu-item:hover, .sidebar-menu .el-menu-item.is-active { background: #4a4a8a; color: #fff; }
.sidebar-menu :deep(.el-sub-menu__title) { color: #ccc; border-radius: 8px; margin: 4px 8px; }
.sidebar-menu :deep(.el-sub-menu .el-menu-item) { padding-left: 36px !important; }
.badge { margin-left: 8px; }
.user-panel { padding: 16px; border-top: 1px solid #2a2a4a; display: flex; align-items: center; gap: 10px; color: #ccc; }
.username { font-size: 13px; color: #fff; }
.role-tag { font-size: 11px; color: #aaa; }

/* 主区域 */
.main-container { 
  flex: 1; 
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.header { 
  background: #fff; 
  border-bottom: 1px solid #eee; 
  display: flex; 
  align-items: center; 
  padding: 0 12px; 
  gap: 8px;
  height: 56px;
}
.menu-btn { padding: 8px; }
.header-title { font-size: 16px; font-weight: 600; color: #333; flex: 1; }
.header-actions { display: flex; gap: 8px; }
.main-content { 
  padding: 16px; 
  background: #f5f7fa; 
  overflow-y: auto;
  flex: 1;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .main-content { padding: 12px; }
  .header-title { font-size: 15px; }
}
</style>
