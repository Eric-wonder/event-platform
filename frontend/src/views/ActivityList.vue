<template>
  <div>
    <!-- 筛选工具栏 -->
    <el-card class="filter-bar" shadow="never">
      <el-row :gutter="16" align="middle">
        <el-col :span="6">
          <el-input v-model="filters.keyword" placeholder="搜索活动名称..." clearable @change="fetchList" />
        </el-col>
        <el-col :span="4">
          <el-select v-model="filters.status" placeholder="状态" clearable @change="fetchList">
            <el-option label="报名中" value="PUBLISHED" />
            <el-option label="已满员" value="FULL" />
            <el-option label="已结束" value="ENDED" />
          </el-select>
        </el-col>
        <el-col :span="4">
          <el-select v-model="filters.category" placeholder="分类" clearable @change="fetchList">
            <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-col>
        <el-col :span="10" style="text-align:right">
          <el-button @click="filters = { keyword:'', status:'', category:'' }; fetchList()">重置</el-button>
        </el-col>
      </el-row>
    </el-card>

    <!-- 活动列表 -->
    <div v-loading="loading" class="activity-grid">
      <el-card v-for="item in list" :key="item.id" class="activity-card" shadow="hover" @click="$router.push(`/activities/${item.id}`)">
        <div class="cover" :style="item.coverImage ? { backgroundImage: `url(${item.coverImage})` } : {}">
          <el-tag class="status-tag" :type="statusType(item.status)">{{ statusLabel(item.status) }}</el-tag>
        </div>
        <div class="card-body">
          <h3 class="title">{{ item.title }}</h3>
          <div class="meta">
            <span><el-icon><Location /></el-icon> {{ item.location }}</span>
            <span><el-icon><Calendar /></el-icon> {{ formatDate(item.startTime) }}</span>
            <span><el-icon><User /></el-icon> {{ item.organizer?.username }}</span>
          </div>
          <div class="footer">
            <span class="fee">¥{{ item.fee === 0 ? '免费' : item.fee }}</span>
            <span class="capacity">{{ item._count?.registrations || 0 }}/{{ item.maxCapacity }}人</span>
          </div>
        </div>
      </el-card>

      <el-empty v-if="!loading && list.length === 0" description="暂无活动" />
    </div>

    <!-- 分页 -->
    <div class="pagination-wrap" v-if="total > 0">
      <el-pagination
        background layout="total, prev, pager, next"
        :total="total" :page-size="query.pageSize" :current-page="query.page"
        @current-change="p => { query.page = p; fetchList() }"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Calendar, Location, User } from '@element-plus/icons-vue'
import { activityApi } from '../api/client'

const loading = ref(false)
const list = ref([])
const total = ref(0)
const query = reactive({ page: 1, pageSize: 12 })
const filters = reactive({ keyword: '', status: '', category: '' })
const categories = ['体育竞技', '公益活动', '教育培训', '文化艺术', '商务交流']

const fetchList = async () => {
  loading.value = true
  try {
    const res = await activityApi.list({ ...query, ...filters })
    list.value = res.data.list
    total.value = res.data.total
  } finally {
    loading.value = false
  }
}

const statusType = s => ({ PUBLISHED: 'success', FULL: 'warning', ENDED: 'info', CANCELLED: 'danger' }[s] || 'info')
const statusLabel = s => ({ PUBLISHED: '报名中', FULL: '已满员', ENDED: '已结束', CANCELLED: '已取消', DRAFT: '草稿' }[s] || s)
const formatDate = d => d ? new Date(d).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

onMounted(fetchList)
</script>

<style scoped>
.filter-bar { margin-bottom: 20px; }
.activity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}
.activity-card {
  cursor: pointer;
  border-radius: 12px;
  overflow: hidden;
  transition: transform 0.2s;
}
.activity-card:hover { transform: translateY(-4px); }
.cover {
  height: 160px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-size: cover;
  background-position: center;
  position: relative;
}
.status-tag {
  position: absolute;
  top: 10px;
  right: 10px;
}
.card-body { padding: 16px; }
.title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #888;
  margin-bottom: 12px;
}
.meta span { display: flex; align-items: center; gap: 4px; }
.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #f0f0f0;
}
.fee { font-size: 18px; font-weight: bold; color: #f56c6c; }
.capacity { font-size: 12px; color: #888; }
.pagination-wrap { display: flex; justify-content: center; margin-top: 24px; }
</style>
