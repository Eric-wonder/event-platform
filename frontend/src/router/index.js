import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '../stores/user'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { guest: true },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/Register.vue'),
    meta: { guest: true },
  },
  {
    path: '/',
    component: () => import('../layouts/Layout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/projects' },

      // 仪表盘
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('../views/Dashboard.vue'),
        meta: { roles: ['ADMIN'] },
      },

      // 报名项目（用户端）
      {
        path: 'projects',
        name: 'ProjectList',
        component: () => import('../views/ProjectList.vue'),
      },
      {
        path: 'projects/:id',
        name: 'ProjectDetail',
        component: () => import('../views/ProjectDetail.vue'),
      },
      {
        path: 'projects/:id/register',
        name: 'ProjectRegister',
        component: () => import('../views/ProjectRegistrationForm.vue'),
      },

      // 报名项目（ADMIN）
      {
        path: 'admin/projects',
        name: 'ProjectListAdmin',
        component: () => import('../views/ProjectList.vue'),
        meta: { roles: ['ADMIN'] },
      },
      {
        path: 'admin/projects/create',
        name: 'ProjectCreate',
        component: () => import('../views/ProjectForm.vue'),
        meta: { roles: ['ADMIN'] },
      },
      {
        path: 'admin/projects/:id',
        name: 'ProjectEdit',
        component: () => import('../views/ProjectForm.vue'),
        meta: { roles: ['ADMIN'] },
      },
      {
        path: 'admin/projects/:id/fields',
        name: 'ProjectFieldDesigner',
        component: () => import('../views/ProjectFieldDesigner.vue'),
        meta: { roles: ['ADMIN'] },
      },
      {
        path: 'admin/projects/:id/registrations',
        name: 'ProjectRegistrations',
        component: () => import('../views/ProjectRegistrations.vue'),
        meta: { roles: ['ADMIN'] },
      },

      // 分销渠道（ADMIN）
      {
        path: 'admin/channels',
        name: 'ChannelManage',
        component: () => import('../views/ChannelManage.vue'),
        meta: { roles: ['ADMIN'] },
      },

      // 佣金报表（ADMIN + 渠道管理员）
      {
        path: 'commissions',
        name: 'CommissionReport',
        component: () => import('../views/CommissionReport.vue'),
        meta: { roles: ['ADMIN', 'CHANNEL_MANAGER'] },
      },

      // 邮件管理（ADMIN）
      {
        path: 'admin/email-settings',
        name: 'EmailSettings',
        component: () => import('../views/EmailSettings.vue'),
        meta: { roles: ['ADMIN'] },
      },
      {
        path: 'admin/email-logs',
        name: 'EmailLogs',
        component: () => import('../views/EmailLogs.vue'),
        meta: { roles: ['ADMIN'] },
      },

      // 用户报名 + 通知
      {
        path: 'my-registrations',
        name: 'MyRegistrations',
        component: () => import('../views/MyRegistrations.vue'),
      },
      {
        path: 'notifications',
        name: 'Notifications',
        component: () => import('../views/Notifications.vue'),
      },

      // 用户管理（ADMIN）
      {
        path: 'admin/users',
        name: 'AdminUsers',
        component: () => import('../views/AdminUsers.vue'),
        meta: { roles: ['ADMIN'] },
      },

      // 支付页面（已登录用户均可访问）
      {
        path: 'pay',
        name: 'PayPage',
        component: () => import('../views/PayPage.vue'),
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('../views/NotFound.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const userStore = useUserStore()
  if (to.meta.requiresAuth && !userStore.token) {
    next('/login')
  } else if (to.meta.guest && userStore.token) {
    next('/')
  } else if (to.meta.roles && !to.meta.roles.includes(userStore.role)) {
    next('/')
  } else {
    next()
  }
})

export default router
