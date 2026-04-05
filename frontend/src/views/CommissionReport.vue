<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3>💰 佣金报表 — {{ channelName }}</h3>
          <el-button type="primary" @click="exportData" :loading="exporting">导出报表</el-button>
        </div>
      </template>

      <!-- 统计卡片 -->
      <el-row :gutter="20" style="margin-bottom:20px">
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-label">累计佣金</div>
            <div class="stat-value warning">¥{{ summary.totalAmount }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-label">待结算</div>
            <div class="stat-value danger">¥{{ summary.pendingAmount }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-label">已结算</div>
            <div class="stat-value success">¥{{ summary.settledAmount }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-label">报名总数</div>
            <div class="stat-value">{{ summary.totalCount }}</div>
          </div>
        </el-col>
      </el-row>

      <!-- 筛选 -->
      <el-row :gutter="12" style="margin-bottom:16px" align="middle">
        <el-col :span="4">
          <el-select v-model="filters.status" placeholder="佣金状态" clearable @change="fetchList">
            <el-option label="待结算" value="PENDING" />
            <el-option label="已结算" value="SETTLED" />
            <el-option label="已取消" value="CANCELLED" />
          </el-select>
        </el-col>
        <el-col :span="6">
          <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期"
            value-format="YYYY-MM-DD" style="width:100%" @change="fetchList" />
        </el-col>
        <el-col :span="4">
          <el-button @click="filters = { status: '' }; dateRange = null; fetchList()">重置</el-button>
        </el-col>
      </el-row>

      <!-- ADMIN 批量结算 -->
      <div v-if="isAdmin" style="margin-bottom:12px">
        <el-checkbox v-model="selectAllFlag" @change="toggleSelectAll">全选</el-checkbox>
        <el-button type="success" size="small" :disabled="selected.length === 0" @click="batchSettle">
          批量结算 ({{ selected.length }})
        </el-button>
      </div>

      <!-- 表格 -->
      <el-table :data="list" v-loading="loading" stripe @selection-change="onSelectionChange">
        <el-table-column v-if="isAdmin" type="selection" width="40" />
        <el-table-column label="报名人" min-width="160">
          <template #default="{ row }">
            <div>{{ row.registration?.realName }}</div>
            <div style="font-size:12px;color:#888">{{ row.registration?.phone }}</div>
          </template>
        </el-table-column>
        <el-table-column label="项目" min-width="200">
          <template #default="{ row }">
            <div>{{ row.project?.title }}</div>
            <div style="font-size:12px;color:#888">报名费 ¥{{ row.projectPrice }}</div>
          </template>
        </el-table-column>
        <el-table-column label="渠道" width="140">
          <template #default="{ row }">
            <el-tag size="small">{{ row.channel?.name || row.channel?.code }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="佣金比例" width="100">
          <template #default="{ row }">
            {{ (row.rate * 100).toFixed(1) }}%
          </template>
        </el-table-column>
        <el-table-column label="佣金金额" width="110">
          <template #default="{ row }">
            <span class="commission-amount">¥{{ row.amount }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="statusTypeMap[row.status]" size="small">
              {{ statusLabelMap[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="报名时间" width="160">
          <template #default="{ row }">
            {{ formatDT(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="结算时间" width="160" v-if="isAdmin">
          <template #default="{ row }">
            {{ row.settledAt ? formatDT(row.settledAt) : '-' }}
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination background layout="total,prev,pager,next"
          :total="total" :page-size="query.pageSize" :current-page="query.page"
          @current-change="p => { query.page = p; fetchList() }"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { commissionApi } from '../api/client'
import { useUserStore } from '../stores/user'

const userStore = useUserStore()
const isAdmin = computed(() => userStore.role === 'ADMIN')
const channelName = ref('')

const loading = ref(false), list = ref([]), total = ref(0)
const query = reactive({ page: 1, pageSize: 20 })
const filters = reactive({ status: '' })
const dateRange = ref(null)

const summary = reactive({ totalAmount: 0, pendingAmount: 0, settledAmount: 0, totalCount: 0 })
const selected = ref([])
const selectAllFlag = ref(false)
const exporting = ref(false)

const statusTypeMap = { PENDING: 'warning', SETTLED: 'success', CANCELLED: 'info' }
const statusLabelMap = { PENDING: '待结算', SETTLED: '已结算', CANCELLED: '已取消' }

const formatDT = d => d ? new Date(d).toLocaleString('zh-CN') : '-'

const fetchList = async () => {
  loading.value = true
  try {
    const params = { ...query }
    if (filters.status) params.status = filters.status
    if (dateRange.value) { params.dateFrom = dateRange.value[0]; params.dateTo = dateRange.value[1] }
    const res = await commissionApi.list(params)
    list.value = res.data.list
    total.value = res.data.total
    Object.assign(summary, res.data.summary)
    channelName.value = list.value[0]?.channel?.name || '所有渠道'
  } finally { loading.value = false }
}

const onSelectionChange = (rows) => { selected.value = rows.filter(r => r.status === 'PENDING') }
const toggleSelectAll = (val) => {
  if (val) selected.value = list.value.filter(r => r.status === 'PENDING')
  else selected.value = []
}

const batchSettle = async () => {
  if (selected.value.length === 0) return
  try {
    await ElMessageBox.confirm(`确定结算 ${selected.value.length} 条佣金记录？`, '批量结算', { type: 'success' })
    await commissionApi.settle(selected.value.map(r => r.id))
    ElMessage.success('结算成功')
    selectAllFlag.value = false
    selected.value = []
    fetchList()
  } catch {}
}

const exportData = async () => {
  exporting.value = true
  try {
    const params = { page: 1, pageSize: 9999 }
    if (filters.status) params.status = filters.status
    if (dateRange.value) { params.dateFrom = dateRange.value[0]; params.dateTo = dateRange.value[1] }
    const res = await commissionApi.list(params)
    const rows = res.data.list
    // 生成 CSV
    const csvHeader = '报名人,手机号,项目,报名费,渠道,佣金比例,佣金金额,状态,报名时间\n'
    const csvRows = rows.map(r =>
      `${r.registration?.realName},${r.registration?.phone},"${r.project?.title}",${r.projectPrice},` +
      `${r.channel?.name},${(r.rate*100).toFixed(1)}%,${r.amount},${statusLabelMap[r.status]},${r.createdAt}`
    ).join('\n')
    const blob = new Blob(['\uFEFF' + csvHeader + csvRows], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `佣金报表_${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  } finally { exporting.value = false }
}

onMounted(fetchList)
</script>

<style scoped>
.stat-card { background: #f5f7fa; border-radius: 12px; padding: 16px 20px; }
.stat-label { font-size: 13px; color: #888; margin-bottom: 4px; }
.stat-value { font-size: 24px; font-weight: bold; }
.stat-value.warning { color: #e6a23c; }
.stat-value.danger { color: #f56c6c; }
.stat-value.success { color: #67c23a; }
.commission-amount { font-weight: bold; color: #f56c6c; font-size: 15px; }
.pagination-wrap { display: flex; justify-content: center; margin-top: 20px; }
</style>
