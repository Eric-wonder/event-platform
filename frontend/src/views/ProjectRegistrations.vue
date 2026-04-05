<template>
  <el-card>
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>「{{ projectTitle }}」报名记录</h3>
        <div style="display:flex;gap:8px">
          <el-button type="success" @click="handleExportExcel">📥 导出 Excel</el-button>
          <el-button type="primary" @click="openSendEmail">📧 发送邮件</el-button>
          <el-button @click="$router.push('/admin/projects')">返回列表</el-button>
        </div>
      </div>
    </template>

    <!-- 统计行 -->
    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :span="6">
        <div class="stat-card"><div class="stat-num">{{ stats.total }}</div><div class="stat-label">总报名</div></div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card success"><div class="stat-num">{{ stats.approved }}</div><div class="stat-label">已通过</div></div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card warning"><div class="stat-num">{{ stats.pending }}</div><div class="stat-label">待审核</div></div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card danger"><div class="stat-num">{{ stats.withChannel }}</div><div class="stat-label">渠道报名</div></div>
      </el-col>
    </el-row>

    <!-- 表格 -->
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column label="报名人" min-width="180">
        <template #default="{ row }">
          <div>{{ row.realName }}</div>
          <div style="font-size:12px;color:#888">{{ row.user?.username }} · {{ row.user?.email }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="phone" label="手机号" width="130" />
      <el-table-column label="渠道" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.channel" type="success" size="small">{{ row.channel }}</el-tag>
          <span v-else style="color:#ccc">-</span>
        </template>
      </el-table-column>
      <el-table-column label="报名时间" width="160">
        <template #default="{ row }">{{ formatDT(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="80">
        <template #default="{ row }">
          <el-button text type="primary" size="small" @click="showDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-wrap" v-if="total > 0">
      <el-pagination background layout="total,prev,pager,next"
        :total="total" :page-size="query.pageSize" :current-page="query.page"
        @current-change="p => { query.page = p; fetchList() }"
      />
    </div>
  </el-card>

  <!-- 详情弹窗 -->
  <el-dialog v-model="detailVisible" title="报名详情" width="600px">
    <el-descriptions v-if="currentRow" :column="2" border>
      <el-descriptions-item label="姓名">{{ currentRow.realName }}</el-descriptions-item>
      <el-descriptions-item label="手机">{{ currentRow.phone }}</el-descriptions-item>
      <el-descriptions-item label="渠道">{{ currentRow.channel || '-' }}</el-descriptions-item>
      <el-descriptions-item label="报名时间">{{ formatDT(currentRow.createdAt) }}</el-descriptions-item>
      <el-descriptions-item label="状态">
        <el-tag :type="statusTagMap[currentRow.status]">{{ statusLabelMap[currentRow.status] }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="支付">
        <el-tag :type="payTagMap[currentRow.payStatus]">{{ payLabelMap[currentRow.payStatus] }}</el-tag>
      </el-descriptions-item>
    </el-descriptions>
  </el-dialog>

  <!-- 发送邮件弹窗 -->
  <el-dialog v-model="emailVisible" title="发送项目报名邮件" width="480px">
    <el-alert type="info" :closable="false" style="margin-bottom:16px">
      系统将发送「{{ projectTitle }}」的完整报名明细至指定邮箱
    </el-alert>
    <el-form-item label="收件邮箱">
      <el-select v-model="emailForm.toEmails" multiple filterable allow-create
        placeholder="输入邮箱地址后回车" style="width:100%">
        <el-option v-for="e in emailForm.toEmails" :key="e" :label="e" :value="e" />
      </el-select>
    </el-form-item>
    <el-form-item label="额外收件">
      <el-input v-model="emailForm.extraEmail" placeholder="如有其他收件人，在此填写" />
    </el-form-item>
    <template #footer>
      <el-button @click="emailVisible = false">取消</el-button>
      <el-button type="primary" :loading="sendingEmail" @click="handleSendEmail">发送邮件</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { projectApi, exportApi, emailApi } from '../api/client'

const route = useRoute()
const projectId = computed(() => Number(route.params.id))

const loading = ref(false), list = ref([]), total = ref(0)
const query = reactive({ page: 1, pageSize: 20 })
const projectTitle = ref('')
const stats = reactive({ total: 0, approved: 0, pending: 0, withChannel: 0 })

const detailVisible = ref(false), currentRow = ref(null)
const emailVisible = ref(false), sendingEmail = ref(false)
const emailForm = reactive({ toEmails: [], extraEmail: '' })

const statusTagMap = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'info' }
const statusLabelMap = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已拒绝', CANCELLED: '已取消' }
const payTagMap = { FREE: 'success', UNPAID: 'warning', PAID: 'success', REFUNDED: 'info' }
const payLabelMap = { FREE: '免费', UNPAID: '待支付', PAID: '已支付', REFUNDED: '已退款' }

const formatDT = d => d ? new Date(d).toLocaleString('zh-CN') : '-'

const fetchList = async () => {
  loading.value = true
  try {
    const res = await projectApi.registrations(projectId.value, query)
    list.value = res.data.list
    total.value = res.data.total
    stats.total = res.data.total
    stats.approved = list.value.filter(r => r.status === 'APPROVED').length
    stats.pending = list.value.filter(r => r.status === 'PENDING').length
    stats.withChannel = list.value.filter(r => r.channel).length
  } finally { loading.value = false }
}

const showDetail = (row) => { currentRow.value = row; detailVisible.value = true }

// 导出 Excel
const handleExportExcel = async () => {
  try {
    ElMessage.warning('正在生成 Excel，请稍候...')
    const res = await exportApi.projectRegistrations(projectId.value)
    const blob = new Blob([res], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // 从响应头取文件名
    const disposition = res.headers?.['content-disposition']
    a.download = disposition
      ? decodeURIComponent(disposition.match(/filename\*?=['"]?([^;\n"']+)/)?.[1] || `${projectTitle.value}.xlsx`)
      : `${projectTitle.value}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (err) {
    ElMessage.error('导出失败：' + (err.message || '未知错误'))
  }
}

const openSendEmail = () => { emailForm.toEmails = []; emailForm.extraEmail = ''; emailVisible.value = true }

const handleSendEmail = async () => {
  if (emailForm.toEmails.length === 0) {
    ElMessage.error('请至少填写一个收件邮箱')
    return
  }
  sendingEmail.value = true
  try {
    const extraEmails = emailForm.extraEmail
      ? emailForm.extraEmail.split(',').map(e => e.trim()).filter(e => e)
      : []
    await emailApi.sendProject(projectId.value, extraEmails)
    ElMessage.success('邮件发送成功')
    emailVisible.value = false
  } finally { sendingEmail.value = false }
}

onMounted(async () => {
  const proj = await projectApi.detail(projectId.value)
  projectTitle.value = proj.data.title
  fetchList()
})
</script>

<style scoped>
.stat-card { background: #f5f7fa; border-radius: 10px; padding: 12px 16px; text-align: center; }
.stat-card.success { background: #e8f8f0; }
.stat-card.warning { background: #fff8e6; }
.stat-card.danger { background: #fef0f0; }
.stat-num { font-size: 24px; font-weight: bold; }
.stat-label { font-size: 12px; color: #888; }
.pagination-wrap { display: flex; justify-content: center; margin-top: 20px; }
</style>
