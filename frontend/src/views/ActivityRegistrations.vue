<template>
  <div v-loading="loading">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3>{{ activity.title }} - 报名管理</h3>
          <el-button type="primary" @click="exportCSV">导出 CSV</el-button>
        </div>
      </template>

      <el-table :data="registrations" border stripe>
        <el-table-column prop="realName" label="姓名" width="100" />
        <el-table-column prop="phone" label="电话" width="130" />
        <el-table-column label="报名时间" width="180">
          <template #default="{ row }">{{ formatDT(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="payStatus" label="支付状态" width="100">
          <template #default="{ row }">
            <el-tag :type="payStatusType(row.payStatus)">{{ payStatusLabel(row.payStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="自定义字段">
          <template #default="{ row }">
            <div v-for="answer in row.fieldAnswers" :key="answer.id" style="font-size: 12px;">
              <strong>{{ answer.field?.label }}:</strong> {{ answer.value }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button-group>
              <el-button size="small" type="success" @click="updateStatus(row.id, 'APPROVED')" :disabled="row.status === 'APPROVED'">通过</el-button>
              <el-button size="small" type="danger" @click="updateStatus(row.id, 'REJECTED')" :disabled="row.status === 'REJECTED'">拒绝</el-button>
            </el-button-group>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        style="margin-top: 20px; justify-content: flex-end;"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="handlePageChange"
      />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { activityApi, registrationApi } from '../api/client'

const route = useRoute()
const router = useRouter()
const id = Number(route.params.id)
const loading = ref(false)
const activity = ref({})
const registrations = ref([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const statusType = s => ({ PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'info' }[s] || 'info')
const statusLabel = s => ({ PENDING: '待审核', APPROVED: '已通过', REJECTED: '已拒绝', CANCELLED: '已取消' }[s] || s)
const payStatusType = s => ({ FREE: 'info', UNPAID: 'warning', PAID: 'success', REFUNDED: 'danger' }[s] || 'info')
const payStatusLabel = s => ({ FREE: '免费', UNPAID: '待支付', PAID: '已支付', REFUNDED: '已退款' }[s] || s)
const formatDT = d => d ? new Date(d).toLocaleString('zh-CN') : ''

const fetchActivity = async () => {
  const res = await activityApi.detail(id)
  activity.value = res.data
}

const fetchRegistrations = async () => {
  loading.value = true
  try {
    const res = await activityApi.registrations(id, { page: page.value, pageSize: pageSize.value })
    registrations.value = res.data.list
    total.value = res.data.total
  } finally {
    loading.value = false
  }
}

const updateStatus = async (regId, status) => {
  await registrationApi.updateStatus(regId, status)
  ElMessage.success('状态已更新')
  fetchRegistrations()
}

const exportCSV = () => {
  window.open(`/api/activities/${id}/export`, '_blank')
}

const handlePageChange = (p) => {
  page.value = p
  fetchRegistrations()
}

onMounted(async () => {
  await fetchActivity()
  await fetchRegistrations()
})
</script>
