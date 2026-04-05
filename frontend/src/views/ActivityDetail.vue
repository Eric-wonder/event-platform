<template>
  <div v-loading="loading">
    <!-- 活动封面 -->
    <div class="cover-banner" :style="activity.coverImage ? { backgroundImage: `url(${activity.coverImage})` } : {}">
      <div class="cover-overlay">
        <h1 class="activity-title">{{ activity.title }}</h1>
        <el-tag :type="statusType(activity.status)">{{ statusLabel(activity.status) }}</el-tag>
      </div>
    </div>

    <el-row :gutter="24">
      <!-- 左侧详情 -->
      <el-col :span="16">
        <el-card>
          <template #header><h3>活动详情</h3></template>
          <div class="description" v-html="activity.description"></div>

          <el-divider />

          <el-descriptions :column="2" border>
            <el-descriptions-item label="分类">{{ activity.category }}</el-descriptions-item>
            <el-descriptions-item label="费用">¥{{ activity.fee === 0 ? '免费' : activity.fee }}</el-descriptions-item>
            <el-descriptions-item label="活动地点">{{ activity.location }}</el-descriptions-item>
            <el-descriptions-item label="名额">{{ activity.currentCount }} / {{ activity.maxCapacity }}</el-descriptions-item>
            <el-descriptions-item label="开始时间">{{ formatDT(activity.startTime) }}</el-descriptions-item>
            <el-descriptions-item label="结束时间">{{ formatDT(activity.endTime) }}</el-descriptions-item>
            <el-descriptions-item label="报名截止">{{ formatDT(activity.regDeadline) }}</el-descriptions-item>
            <el-descriptions-item label="组织者">{{ activity.organizer?.username }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <!-- 报名表单 -->
        <el-card v-if="showRegForm" class="reg-card">
          <template #header><h3>立即报名</h3></template>
          <el-form ref="regFormRef" :model="regForm" :rules="regRules" label-width="100px">
            <el-form-item label="真实姓名" prop="realName">
              <el-input v-model="regForm.realName" placeholder="请输入真实姓名" />
            </el-form-item>
            <el-form-item label="手机号" prop="phone">
              <el-input v-model="regForm.phone" placeholder="请输入手机号" />
            </el-form-item>
            <el-form-item v-for="field in activity.formFields" :key="field.id" :label="field.label" :prop="`fieldAnswers.${field.id}`" :required="field.required">
              <el-select v-if="field.fieldType === 'SELECT'" v-model="regForm.fieldAnswers[field.id]" placeholder="请选择">
                <el-option v-for="opt in JSON.parse(field.options || '[]')" :key="opt" :label="opt" :value="opt" />
              </el-select>
              <el-radio-group v-else-if="field.fieldType === 'RADIO'">
                <el-radio v-for="opt in JSON.parse(field.options || '[]')" :key="opt" :value="opt">{{ opt }}</el-radio>
              </el-radio-group>
              <el-checkbox-group v-else-if="field.fieldType === 'CHECKBOX'">
                <el-checkbox v-for="opt in JSON.parse(field.options || '[]')" :key="opt" :value="opt">{{ opt }}</el-checkbox>
              </el-checkbox-group>
              <el-date-picker v-else-if="field.fieldType === 'DATE'" v-model="regForm.fieldAnswers[field.id]" type="date" placeholder="选择日期" style="width:100%" />
              <el-input v-else-if="field.fieldType === 'TEXTAREA'" v-model="regForm.fieldAnswers[field.id]" type="textarea" placeholder="请输入" />
              <el-input v-else v-model="regForm.fieldAnswers[field.id]" placeholder="请输入" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="regLoading" @click="handleRegister" style="width:100%">提交报名</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <!-- 右侧操作栏 -->
      <el-col :span="8">
        <el-card v-if="isOwner || isAdmin">
          <template #header><h3>管理操作</h3></template>
          <el-space direction="vertical" style="width:100%">
            <el-button type="primary" @click="$router.push(`/activities/${id}/edit`)" style="width:100%">编辑活动</el-button>
            <el-button @click="$router.push(`/activities/${id}/registrations`)">查看报名</el-button>
            <el-button v-if="activity.status === 'DRAFT'" type="success" @click="changeStatus('PUBLISHED')">发布活动</el-button>
            <el-button v-if="activity.status === 'PUBLISHED'" type="warning" @click="changeStatus('ENDED')">结束报名</el-button>
            <el-button v-if="activity.status === 'PUBLISHED'" type="danger" @click="changeStatus('CANCELLED')">取消活动</el-button>
          </el-space>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../stores/user'
import { activityApi, registrationApi } from '../api/client'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const id = Number(route.params.id)
const loading = ref(false)
const regLoading = ref(false)
const activity = ref({})
const regFormRef = ref()
const regForm = ref({ realName: '', phone: '', fieldAnswers: {} })
const regRules = {
  realName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  phone: [{ required: true, pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' }],
}

const isOwner = computed(() => activity.value.organizerId === userStore.userInfo?.id)
const isAdmin = computed(() => userStore.userInfo?.role === 'ADMIN')
const showRegForm = computed(() =>
  activity.value.status === 'PUBLISHED'
  && new Date() <= new Date(activity.value.regDeadline)
  && activity.value.currentCount < activity.value.maxCapacity
  && userStore.token
  && !isOwner.value
)

const statusType = s => ({ PUBLISHED: 'success', FULL: 'warning', ENDED: 'info', CANCELLED: 'danger', DRAFT: 'info' }[s] || 'info')
const statusLabel = s => ({ PUBLISHED: '报名中', FULL: '已满员', ENDED: '已结束', CANCELLED: '已取消', DRAFT: '草稿' }[s] || s)
const formatDT = d => d ? new Date(d).toLocaleString('zh-CN') : ''

const fetchDetail = async () => {
  loading.value = true
  try {
    const res = await activityApi.detail(id)
    activity.value = res.data
  } finally { loading.value = false }
}

const handleRegister = async () => {
  const valid = await regFormRef.value.validate().catch(() => false)
  if (!valid) return
  regLoading.value = true
  try {
    await registrationApi.register(id, regForm.value)
    ElMessage.success('报名成功！')
    fetchDetail()
  } finally { regLoading.value = false }
}

const changeStatus = async (status) => {
  await activityApi.updateStatus(id, status)
  ElMessage.success('状态已更新')
  fetchDetail()
}

onMounted(fetchDetail)
</script>

<style scoped>
.cover-banner {
  height: 280px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-size: cover;
  background-position: center;
  border-radius: 12px;
  margin-bottom: 24px;
  position: relative;
  overflow: hidden;
}
.cover-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 24px;
  background: linear-gradient(transparent, rgba(0,0,0,0.7));
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}
.activity-title { color: #fff; font-size: 28px; margin: 0; }
.description { line-height: 1.8; color: #444; white-space: pre-wrap; }
.reg-card { margin-top: 20px; }
</style>
