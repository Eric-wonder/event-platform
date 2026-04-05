<template>
  <div>
    <!-- 赛事报名 -->
    <el-card style="margin-bottom:20px">
      <template #header><h3>🏆 赛事报名</h3></template>
      <el-table :data="activityList" v-loading="activityLoading" stripe>
        <el-table-column label="活动名称" min-width="200">
          <template #default="{ row }">
            <router-link :to="`/activities/${row.activityId}`" class="title-link">{{ row.activity?.title }}</router-link>
          </template>
        </el-table-column>
        <el-table-column label="活动时间" width="160">
          <template #default="{ row }">{{ formatDT(row.activity?.startTime) }}</template>
        </el-table-column>
        <el-table-column prop="activity.location" label="地点" min-width="150" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="stType(row.status)">{{ stLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="支付" width="100">
          <template #default="{ row }">
            <el-tag :type="payType(row.payStatus)">{{ payLabel(row.payStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="$router.push(`/activities/${row.activityId}`)">查看</el-button>
            <el-button text type="danger" size="small" v-if="row.status === 'PENDING'" @click="cancelActivity(row)">取消</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!activityLoading && !activityList.length" description="暂无赛事报名" />
    </el-card>

    <!-- 项目报名 -->
    <el-card>
      <template #header><h3>📋 项目报名</h3></template>
      <el-table :data="projectList" v-loading="projectLoading" stripe>
        <el-table-column label="项目名称" min-width="200">
          <template #default="{ row }">
            <router-link :to="`/projects/${row.projectId}`" class="title-link">{{ row.project?.title }}</router-link>
          </template>
        </el-table-column>
        <el-table-column prop="realName" label="报名人" width="100" />
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column label="报名时间" width="160">
          <template #default="{ row }">{{ formatDT(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="费用" width="90">
          <template #default="{ row }">
            <span :class="{ 'amount-paid': row.payStatus === 'PAID' || row.payStatus === 'FREE', 'amount-unpaid': row.payStatus === 'UNPAID' }">
              ¥{{ row.price || 0 }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="支付状态" width="100">
          <template #default="{ row }">
            <el-tag :type="projectPayType(row.payStatus)" size="small">{{ projectPayLabel(row.payStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审核状态" width="100">
          <template #default="{ row }">
            <el-tag :type="stType(row.status)" size="small">{{ stLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <!-- 待支付：显示去支付 -->
            <el-button
              v-if="row.payStatus === 'UNPAID'"
              type="warning" size="small"
              @click="goToPay(row)"
            >
              💰 去支付
            </el-button>
            <el-button text type="primary" size="small" @click="$router.push(`/projects/${row.projectId}`)">查看</el-button>
            <el-button
              text type="danger" size="small"
              v-if="row.status === 'PENDING' && row.payStatus !== 'PAID'"
              @click="cancelProject(row)"
            >取消</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!projectLoading && !projectList.length" description="暂无项目报名" />
    </el-card>

    <!-- 支付确认弹窗 -->
    <el-dialog v-model="payDialogVisible" title="确认支付" width="440px">
      <div v-if="payTarget">
        <p style="font-size:15px;margin-bottom:8px">
          项目：<strong>{{ payTarget.project?.title }}</strong>
        </p>
        <p style="font-size:15px;margin-bottom:16px">
          金额：<strong style="color:#f56c6c;font-size:20px">¥{{ payTarget.price }}</strong>
        </p>
        <el-radio-group v-model="payMethod">
          <el-radio label="wechat">💚 微信支付</el-radio>
        </el-radio-group>
      </div>
      <template #footer>
        <el-button @click="payDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="paying" @click="confirmPay">
          确认支付 ¥{{ payTarget?.price }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { registrationApi, regApi } from '../api/client'

const router = useRouter()
const activityLoading = ref(false), projectLoading = ref(false)
const activityList = ref([]), projectList = ref([])

const payDialogVisible = ref(false), paying = ref(false)
const payTarget = ref(null), payMethod = ref('wechat')

const stType = s => ({ PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'info' }[s] || 'info')
const stLabel = s => ({ PENDING: '待审核', APPROVED: '已通过', REJECTED: '已拒绝', CANCELLED: '已取消' }[s] || s)
const payType = s => ({ FREE: 'success', UNPAID: 'warning', PAID: 'success', REFUNDED: 'info' }[s] || 'info')
const payLabel = s => ({ FREE: '免费', UNPAID: '待支付', PAID: '已支付', REFUNDED: '已退款' }[s] || s)
const projectPayType = s => ({ FREE: 'success', UNPAID: 'warning', PAID: 'success', REFUNDED: 'info' }[s] || 'info')
const projectPayLabel = s => ({ FREE: '免费', UNPAID: '待支付', PAID: '已支付', REFUNDED: '已退款' }[s] || s)
const formatDT = d => d ? new Date(d).toLocaleString('zh-CN') : ''

const fetchActivity = async () => {
  activityLoading.value = true
  try {
    const res = await registrationApi.mine()
    activityList.value = res.data?.list || res.data || []
  } finally { activityLoading.value = false }
}

const fetchProject = async () => {
  projectLoading.value = true
  try {
    const res = await regApi.mine()
    projectList.value = res.data || []
  } finally { projectLoading.value = false }
}

const cancelActivity = async (row) => {
  await ElMessageBox.confirm('确定取消此报名吗？', '提示')
  await registrationApi.cancel(row.activityId)
  ElMessage.success('已取消')
  fetchActivity()
}

const cancelProject = async (row) => {
  await ElMessageBox.confirm('确定取消此报名吗？', '提示')
  await regApi.cancel(row.projectId)
  ElMessage.success('已取消')
  fetchProject()
}

const goToPay = (row) => {
  payTarget.value = row
  payDialogVisible.value = true
}

const confirmPay = async () => {
  if (!payTarget.value) return
  paying.value = true
  payDialogVisible.value = false
  try {
    // 跳转支付页面，携带报名信息
    router.push({
      path: '/pay',
      query: {
        projectId: payTarget.value.projectId,
        registrationId: payTarget.value.id,
        amount: payTarget.value.price,
        projectTitle: payTarget.value.project?.title,
      },
    })
  } finally {
    paying.value = false
  }
}

onMounted(() => {
  fetchActivity()
  fetchProject()
})
</script>

<style scoped>
.title-link { color: #409eff; text-decoration: none; }
.title-link:hover { text-decoration: underline; }
.amount-paid { color: #67c23a; font-weight: bold; }
.amount-unpaid { color: #f56c6c; font-weight: bold; }
</style>
