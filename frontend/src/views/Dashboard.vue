<template>
  <div class="dashboard">
    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stat-row">
      <el-col :span="6" v-for="stat in stats" :key="stat.label">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-icon" :style="{ background: stat.bg }">
            <span>{{ stat.icon }}</span>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stat.value }}</div>
            <div class="stat-label">{{ stat.label }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 快捷操作 -->
    <el-row :gutter="20" style="margin-top:24px">
      <el-col :span="16">
        <el-card>
          <template #header><h3>报名项目</h3></template>
          <div v-loading="projectsLoading">
            <div v-for="p in recentProjects" :key="p.id" class="project-item">
              <div class="project-info">
                <span class="project-title">{{ p.title }}</span>
                <el-tag :type="p.isEnabled ? 'success' : 'info'" size="small">
                  {{ p.isEnabled ? '启用中' : '已停用' }}
                </el-tag>
              </div>
              <div class="project-meta">
                <span>¥{{ p.price }}</span>
                <span>{{ formatDate(p.createdAt) }}</span>
              </div>
            </div>
            <el-empty v-if="!projectsLoading && recentProjects.length === 0" description="暂无报名项目" />
          </div>
          <div style="margin-top:12px;text-align:right">
            <el-button type="primary" size="small" @click="$router.push('/admin/projects')">
              管理报名项目
            </el-button>
          </div>
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card>
          <template #header><h3>快捷操作</h3></template>
          <el-space direction="vertical" style="width:100%" :size="12">
            <el-button type="primary" style="width:100%" @click="$router.push('/admin/projects/create')">
              ➕ 创建报名项目
            </el-button>
            <el-button style="width:100%" @click="$router.push('/activities/create')">
              🏆 创建赛事活动
            </el-button>
            <el-button style="width:100%" @click="$router.push('/admin/users')">
              👥 用户管理
            </el-button>
            <el-button style="width:100%" @click="$router.push('/notifications')">
              🔔 通知中心
            </el-button>
          </el-space>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminApi } from '../api/client'
import { activityApi } from '../api/client'

const stats = ref([
  { label: '报名项目', value: '-', icon: '📋', bg: '#e6f7ff' },
  { label: '赛事活动', value: '-', icon: '🏆', bg: '#fff7e6' },
  { label: '总报名数', value: '-', icon: '👤', bg: '#f6ffed' },
  { label: '系统用户', value: '-', icon: '🔐', bg: '#f9f0ff' },
])
const recentProjects = ref([])
const projectsLoading = ref(false)

const formatDate = d => d ? new Date(d).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit' }) : ''

onMounted(async () => {
  // 加载统计数据
  try {
    const [projRes, actRes, usersRes] = await Promise.all([
      adminApi.projectStats().catch(() => ({ data: { data: { total: 0 } } })),
      activityApi.list({ pageSize: 1 }),
      adminApi.users({ pageSize: 1 }),
    ])
    stats.value[0].value = projRes.data?.total ?? '-'
    stats.value[1].value = actRes.data?.total ?? '-'
    stats.value[2].value = projRes.data?.registrationCount ?? '-'
    stats.value[3].value = usersRes.data?.total ?? '-'
  } catch {}

  // 加载最近报名项目
  projectsLoading.value = true
  try {
    const res = await adminApi.projectList({ page: 1, pageSize: 5 })
    recentProjects.value = res.data?.list || []
  } catch {}
  projectsLoading.value = false
})
</script>

<style scoped>
.stat-row { margin-bottom: 8px; }
.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  border-radius: 12px;
  padding: 8px 0;
}
.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
}
.stat-value { font-size: 28px; font-weight: bold; color: #333; line-height: 1.2; }
.stat-label { font-size: 13px; color: #888; margin-top: 4px; }
.project-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}
.project-item:last-child { border-bottom: none; }
.project-title { font-weight: 500; color: #333; }
.project-meta { font-size: 12px; color: #999; text-align: right; display: flex; flex-direction: column; gap: 2px; }
.project-info { display: flex; align-items: center; gap: 8px; }
</style>
