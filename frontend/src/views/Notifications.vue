<template>
  <el-card>
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>我的通知</h3>
        <el-button text @click="markAll" :disabled="!unreadCount">全部标为已读</el-button>
      </div>
    </template>
    <div v-loading="loading">
      <el-space direction="vertical" style="width:100%" :size="12">
        <div v-for="n in list" :key="n.id"
          class="notif-item"
          :class="{ unread: !n.isRead }"
          @click="handleRead(n)">
          <div class="notif-title">{{ n.title }}</div>
          <div class="notif-content">{{ n.content }}</div>
          <div class="notif-time">{{ formatTime(n.createdAt) }}</div>
        </div>
        <el-empty v-if="!loading && list.length === 0" description="暂无通知" />
      </el-space>
    </div>
    <div class="pagination-wrap" v-if="total > 0">
      <el-pagination background layout="total,prev,pager,next"
        :total="total" :page-size="query.pageSize" :current-page="query.page"
        @current-change="p => { query.page = p; fetch() }" />
    </div>
  </el-card>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { notificationApi } from '../api/client'

const loading = ref(false), list = ref([]), total = ref(0), unreadCount = ref(0)
const query = reactive({ page: 1, pageSize: 20 })

const fetch = async () => {
  loading.value = true
  try {
    const [res, countRes] = await Promise.all([
      notificationApi.list(query),
      notificationApi.unreadCount(),
    ])
    list.value = res.data.list
    total.value = res.data.total
    unreadCount.value = countRes.data.count
  } finally { loading.value = false }
}

const handleRead = async (n) => {
  if (!n.isRead) {
    await notificationApi.markRead(n.id)
    n.isRead = true
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  }
}

const markAll = async () => {
  await notificationApi.markAllRead()
  ElMessage.success('已全部标记为已读')
  unreadCount.value = 0
  list.value.forEach(n => { n.isRead = true })
}

const formatTime = d => {
  const date = new Date(d)
  const now = new Date()
  const diff = now - date
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return date.toLocaleDateString('zh-CN')
}

onMounted(fetch)
</script>

<style scoped>
.notif-item {
  padding: 16px;
  background: #f9f9f9;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}
.notif-item:hover { background: #f0f0f0; }
.notif-item.unread { background: #ecf5ff; border-left: 3px solid #409eff; }
.notif-title { font-weight: 600; margin-bottom: 6px; color: #333; }
.notif-content { font-size: 13px; color: #666; margin-bottom: 6px; }
.notif-time { font-size: 12px; color: #999; text-align: right; }
.pagination-wrap { display: flex; justify-content: center; margin-top: 16px; }
</style>
