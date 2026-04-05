<template>
  <el-card>
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>报名项目管理</h3>
        <el-button type="primary" @click="$router.push('/admin/projects/create')">
          ➕ 新建项目
        </el-button>
      </div>
    </template>

    <!-- 筛选栏 -->
    <el-row :gutter="12" style="margin-bottom:16px" align="middle">
      <el-col :span="8">
        <el-input v-model="filters.keyword" placeholder="搜索项目名称..." clearable @change="fetchList" />
      </el-col>
      <el-col :span="4">
        <el-select v-model="filters.isEnabled" placeholder="状态" clearable @change="fetchList">
          <el-option label="启用中" :value="true" />
          <el-option label="已停用" :value="false" />
        </el-select>
      </el-col>
      <el-col :span="12" style="text-align:right">
        <el-button @click="filters = { keyword:'', isEnabled:'' }; fetchList()">重置</el-button>
      </el-col>
    </el-row>

    <!-- 表格 -->
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column label="封面" width="80">
        <template #default="{ row }">
          <el-avatar v-if="row.coverImage" :src="row.coverImage" :size="48" shape="square" />
          <div v-else class="cover-placeholder">📋</div>
        </template>
      </el-table-column>
      <el-table-column prop="title" label="项目名称" min-width="200" />
      <el-table-column label="价格" width="100">
        <template #default="{ row }">
          <span class="price">¥{{ row.price }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-switch
            :model-value="row.isEnabled"
            active-text="启用"
            inactive-text="停用"
            @change="toggleEnabled(row)"
          />
        </template>
      </el-table-column>
      <el-table-column label="截止时间" width="160">
        <template #default="{ row }">
          {{ row.deadline ? formatDT(row.deadline) : '不限' }}
        </template>
      </el-table-column>
      <el-table-column label="报名数" width="100">
        <template #default="{ row }">
          <el-badge :value="row.registrationCount || 0" />
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">
          {{ formatDT(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" size="small" text @click="$router.push(`/admin/projects/${row.id}`)">编辑</el-button>
          <el-button size="small" text @click="$router.push(`/admin/projects/${row.id}/registrations`)">报名</el-button>
          <el-popconfirm title="确定删除此项目？" @confirm="handleDelete(row)">
            <template #reference>
              <el-button type="danger" size="small" text>删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-wrap">
      <el-pagination
        background layout="total,prev,pager,next"
        :total="total" :page-size="query.pageSize" :current-page="query.page"
        @current-change="p => { query.page = p; fetchList() }"
      />
    </div>
  </el-card>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { projectApi } from '../api/client'

const router = useRouter()
const loading = ref(false)
const list = ref([])
const total = ref(0)
const query = reactive({ page: 1, pageSize: 10 })
const filters = reactive({ keyword: '', isEnabled: '' })

const formatDT = d => d ? new Date(d).toLocaleString('zh-CN') : ''

const fetchList = async () => {
  loading.value = true
  try {
    const params = { ...query }
    if (filters.keyword) params.keyword = filters.keyword
    if (filters.isEnabled !== '') params.isEnabled = filters.isEnabled
    const res = await projectApi.list(params)
    list.value = res.data.list
    total.value = res.data.total
  } finally { loading.value = false }
}

const toggleEnabled = async (row) => {
  await projectApi.update(row.id, { isEnabled: !row.isEnabled })
  row.isEnabled = !row.isEnabled
  ElMessage.success(row.isEnabled ? '已启用' : '已停用')
}

const handleDelete = async (row) => {
  await projectApi.delete(row.id)
  ElMessage.success('删除成功')
  fetchList()
}

onMounted(fetchList)
</script>

<style scoped>
.price { font-weight: bold; color: #f56c6c; }
.cover-placeholder {
  width: 48px; height: 48px;
  background: #f5f7fa;
  border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
}
.pagination-wrap { display: flex; justify-content: center; margin-top: 20px; }
</style>
