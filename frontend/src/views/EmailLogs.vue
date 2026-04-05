<template>
  <el-card>
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>📧 邮件发送日志</h3>
        <el-button type="primary" @click="fetchLogs">🔄 刷新</el-button>
      </div>
    </template>

    <!-- 筛选 -->
    <el-row :gutter="12" style="margin-bottom:16px">
      <el-col :span="4">
        <el-select v-model="filters.type" placeholder="邮件类型" clearable @change="fetchLogs">
          <el-option label="每日汇总" value="DAILY_SUMMARY" />
          <el-option label="项目邮件" value="PROJECT_SUMMARY" />
          <el-option label="测试邮件" value="TEST" />
        </el-select>
      </el-col>
      <el-col :span="4">
        <el-select v-model="filters.status" placeholder="发送状态" clearable @change="fetchLogs">
          <el-option label="成功" value="SENT" />
          <el-option label="失败" value="FAILED" />
        </el-select>
      </el-col>
      <el-col :span="6">
        <el-date-picker v-model="dateRange" type="daterange" range-separator="至"
          start-placeholder="开始" end-placeholder="结束" value-format="YYYY-MM-DD"
          style="width:100%" @change="fetchLogs" />
      </el-col>
    </el-row>

    <!-- 统计 -->
    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :span="6">
        <div class="stat-card success">
          <div class="stat-num">{{ stats.sentCount }}</div>
          <div class="stat-label">发送成功</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card danger">
          <div class="stat-num">{{ stats.failedCount }}</div>
          <div class="stat-label">发送失败</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-num">{{ stats.totalCount }}</div>
          <div class="stat-label">总发送次数</div>
        </div>
      </el-col>
    </el-row>

    <!-- 表格 -->
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column label="类型" width="130">
        <template #default="{ row }">
          <el-tag :type="typeTagMap[row.type]" size="small">{{ typeLabelMap[row.type] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="主题" min-width="240">
        <template #default="{ row }">
          <div>{{ row.subject }}</div>
          <div v-if="row.error" style="color:#f56c6c;font-size:12px">❌ {{ row.error }}</div>
        </template>
      </el-table-column>
      <el-table-column label="收件人" min-width="200">
        <template #default="{ row }">
          <div v-if="row.toEmails">
            <span v-for="e in parseEmails(row.toEmails)" :key="e"
              class="email-chip" :title="e">{{ e }}</span>
          </div>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'SENT' ? 'success' : 'danger'" size="small">
            {{ row.status === 'SENT' ? '成功' : '失败' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="发送时间" width="160">
        <template #default="{ row }">
          {{ row.sentAt ? formatDT(row.sentAt) : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="记录时间" width="160">
        <template #default="{ row }">
          {{ formatDT(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="备注" min-width="140">
        <template #default="{ row }">
          <span style="color:#888;font-size:13px">{{ row.remark || '-' }}</span>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-wrap">
      <el-pagination background layout="total,prev,pager,next"
        :total="total" :page-size="query.pageSize" :current-page="query.page"
        @current-change="p => { query.page = p; fetchLogs() }"
      />
    </div>
  </el-card>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { emailApi } from '../api/client'

const loading = ref(false), list = ref([]), total = ref(0)
const query = reactive({ page: 1, pageSize: 20 })
const filters = reactive({ type: '', status: '' })
const dateRange = ref(null)
const stats = reactive({ sentCount: 0, failedCount: 0, totalCount: 0 })

const typeTagMap = { DAILY_SUMMARY: 'primary', PROJECT_SUMMARY: 'success', TEST: 'warning' }
const typeLabelMap = { DAILY_SUMMARY: '每日汇总', PROJECT_SUMMARY: '项目邮件', TEST: '测试邮件' }

const parseEmails = (s) => {
  try { return JSON.parse(s) } catch { return [s] }
}
const formatDT = d => d ? new Date(d).toLocaleString('zh-CN') : '-'

const fetchLogs = async () => {
  loading.value = true
  try {
    const params = { ...query }
    if (filters.type) params.type = filters.type
    if (filters.status) params.status = filters.status
    if (dateRange.value) { params.dateFrom = dateRange.value[0]; params.dateTo = dateRange.value[1] }
    const res = await emailApi.logs(params)
    list.value = res.data.list
    total.value = res.data.total
    // 简单统计
    stats.totalCount = total.value
    stats.sentCount = list.value.filter(r => r.status === 'SENT').length
    stats.failedCount = list.value.filter(r => r.status === 'FAILED').length
  } finally { loading.value = false }
}

onMounted(fetchLogs)
</script>

<style scoped>
.stat-card { background: #f5f7fa; border-radius: 10px; padding: 14px 16px; text-align: center; }
.stat-card.success { background: #e8f8f0; }
.stat-card.danger { background: #fef0f0; }
.stat-num { font-size: 26px; font-weight: bold; color: #333; }
.stat-card.success .stat-num { color: #67c23a; }
.stat-card.danger .stat-num { color: #f56c6c; }
.stat-label { font-size: 12px; color: #888; margin-top: 2px; }
.email-chip {
  display: inline-block; background: #f0f0f0; border-radius: 4px;
  padding: 2px 6px; font-size: 12px; margin: 2px 2px;
  max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pagination-wrap { display: flex; justify-content: center; margin-top: 20px; }
</style>
