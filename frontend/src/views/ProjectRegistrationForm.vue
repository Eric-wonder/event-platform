<template>
  <div class="reg-form-page">
    <!-- 项目基本信息 -->
    <div class="project-header" v-if="project">
      <el-card class="project-cover" v-if="project.coverImage">
        <img :src="project.coverImage" :alt="project.title" />
      </el-card>
      <div class="project-info">
        <h2>{{ project.title }}</h2>
        <div class="project-meta">
          <el-tag v-if="project.price > 0" type="danger" size="large">¥{{ project.price }}</el-tag>
          <el-tag v-else type="success" size="large">免费</el-tag>
          <el-tag v-if="project.deadline" :type="isDeadlineSoon ? 'warning' : 'info'" size="small">
            截止：{{ formatDT(project.deadline) }}
          </el-tag>
          <el-tag v-if="alreadyRegistered" type="success">已报名</el-tag>
        </div>
        <!-- 富文本项目介绍 -->
        <div class="project-content" v-html="project.content"></div>
      </div>
    </div>

    <!-- 报名表单 -->
    <el-card class="form-card" v-if="project && (!alreadyRegistered || editMode)">
      <template #header><h3>📝 填写报名信息</h3></template>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <!-- 姓名 -->
        <el-form-item label="真实姓名" prop="realName">
          <el-input v-model="form.realName" placeholder="请输入真实姓名" maxlength="50" />
        </el-form-item>

        <!-- 手机号 -->
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="form.phone" placeholder="请输入手机号" maxlength="11" />
        </el-form-item>

        <!-- 分销渠道（扩展属性） -->
        <el-form-item label="了解渠道" v-if="showChannel">
          <el-select v-model="form.channel" placeholder="请选择" style="width:100%" clearable>
            <el-option v-for="c in channelOptions" :key="c" :label="c" :value="c" />
            <el-option label="其他" value="__other__" />
          </el-select>
          <el-input v-if="form.channel === '__other__'" v-model="channelOther" placeholder="请输入渠道来源" style="margin-top:8px" />
        </el-form-item>

        <!-- 动态字段 -->
        <template v-for="field in project.fields" :key="field.id">
          <el-divider content-position="left">{{ field.label }}<span v-if="field.required" style="color:#f56c6c"> *</span></el-divider>

          <!-- TEXT -->
          <el-form-item
            v-if="field.fieldType === 'TEXT'"
            :label="field.label"
            :prop="`answers.${field.id}`"
            :rules="buildRules(field)"
          >
            <el-input
              v-model="form.answers[field.id]"
              :placeholder="field.placeholder || `请输入${field.label}`"
              :maxlength="field.validation?.maxLength || 200"
            />
          </el-form-item>

          <!-- TEXTAREA -->
          <el-form-item
            v-else-if="field.fieldType === 'TEXTAREA'"
            :label="field.label"
            :prop="`answers.${field.id}`"
            :rules="buildRules(field)"
          >
            <el-input
              v-model="form.answers[field.id]"
              type="textarea"
              :rows="4"
              :placeholder="field.placeholder || `请输入${field.label}`"
              :maxlength="field.validation?.maxLength || 2000"
              show-word-limit
            />
          </el-form-item>

          <!-- SELECT -->
          <el-form-item
            v-else-if="field.fieldType === 'SELECT'"
            :label="field.label"
            :prop="`answers.${field.id}`"
            :rules="buildRules(field)"
          >
            <el-select v-model="form.answers[field.id]" style="width:100%" :placeholder="field.placeholder || '请选择'">
              <el-option v-for="opt in field.options" :key="opt" :label="opt" :value="opt" />
            </el-select>
          </el-form-item>

          <!-- RADIO -->
          <el-form-item
            v-else-if="field.fieldType === 'RADIO'"
            :label="field.label"
            :prop="`answers.${field.id}`"
            :rules="buildRules(field)"
          >
            <el-radio-group v-model="form.answers[field.id]">
              <el-radio v-for="opt in field.options" :key="opt" :label="opt">{{ opt }}</el-radio>
            </el-radio-group>
          </el-form-item>

          <!-- CHECKBOX -->
          <el-form-item
            v-else-if="field.fieldType === 'CHECKBOX'"
            :label="field.label"
            :prop="`answers.${field.id}`"
            :rules="buildRules(field)"
          >
            <el-checkbox-group v-model="form.answers[field.id]">
              <el-checkbox v-for="opt in field.options" :key="opt" :label="opt">{{ opt }}</el-checkbox>
            </el-checkbox-group>
          </el-form-item>

          <!-- DATE -->
          <el-form-item
            v-else-if="field.fieldType === 'DATE'"
            :label="field.label"
            :prop="`answers.${field.id}`"
            :rules="buildRules(field)"
          >
            <el-date-picker
              v-model="form.answers[field.id]"
              type="date"
              :placeholder="field.placeholder || '选择日期'"
              value-format="YYYY-MM-DD"
              style="width:100%"
            />
          </el-form-item>

          <!-- FILE -->
          <el-form-item
            v-else-if="field.fieldType === 'FILE'"
            :label="field.label"
            :prop="`answers.${field.id}`"
            :rules="buildRules(field)"
          >
            <div class="file-upload-area">
              <!-- 已上传文件列表 -->
              <div v-if="uploadedFiles[field.id] && uploadedFiles[field.id].length > 0" class="uploaded-list">
                <div v-for="(url, fi) in uploadedFiles[field.id]" :key="fi" class="uploaded-file">
                  <span>📄 {{ getFileName(url) }}</span>
                  <el-button text type="danger" size="small" @click="removeFile(field.id, fi, url)">移除</el-button>
                </div>
              </div>
              <!-- 上传按钮 -->
              <el-upload
                :action="uploadUrl"
                :headers="{ Authorization: `Bearer ${token}` }"
                :data="{ fieldId: field.id }"
                :show-file-list="false"
                :before-upload="(f) => beforeUpload(f, field.id)"
                :on-success="(r, f) => onUploadSuccess(r, f, field.id)"
                :on-error="onUploadError"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
              >
                <el-button type="primary" plain>
                  <el-icon><Upload /></el-icon> 点击上传文件
                </el-button>
              </el-upload>
              <div class="upload-tip">支持图片/PDF/Word/Excel，最大 20MB</div>
            </div>
          </el-form-item>
        </template>

        <!-- 提交按钮 -->
        <el-form-item style="margin-top:32px">
          <el-button
            type="primary"
            size="large"
            :loading="submitting"
            :disabled="alreadyRegistered && !editMode"
            @click="handleSubmit"
            style="width:200px"
          >
            {{ submitting ? '提交中...' : (project.price > 0 ? '立即报名（待支付）' : '立即报名') }}
          </el-button>
          <el-button v-if="alreadyRegistered" size="large" @click="editMode = !editMode">
            {{ editMode ? '取消编辑' : '修改报名' }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 已报名状态 -->
    <el-card v-if="alreadyRegistered && !editMode && myRegistration" class="registered-card">
      <template #header><h3>✅ 报名成功</h3></template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="报名项目">{{ project?.title }}</el-descriptions-item>
        <el-descriptions-item label="报名时间">{{ formatDT(myRegistration.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="姓名">{{ myRegistration.realName }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ myRegistration.phone }}</el-descriptions-item>
        <el-descriptions-item label="报名状态">
          <el-tag :type="statusTagMap[myRegistration.status]">{{ statusLabelMap[myRegistration.status] }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="支付状态">
          <el-tag :type="payTagMap[myRegistration.payStatus]">{{ payLabelMap[myRegistration.payStatus] }}</el-tag>
        </el-descriptions-item>
      </el-descriptions>
      <div style="margin-top:16px;text-align:center">
        <el-button type="danger" plain @click="handleCancel">取消报名</el-button>
        <el-button type="primary" plain @click="editMode = true">修改信息</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import { projectApi, regApi, uploadApi } from '../api/client'

const route = useRoute()
const router = useRouter()

const projectId = computed(() => Number(route.params.id))
const token = localStorage.getItem('token') || ''
const uploadUrl = `${import.meta.env.VITE_API_BASE_URL || '/api'}/upload/file`

const project = ref(null)
const formRef = ref()
const submitting = ref(false)
const alreadyRegistered = ref(false)
const editMode = ref(false)
const myRegistration = ref(null)
const channelOptions = ['官网', '公众号', '小程序', '朋友圈', '线下地推', '合作渠道', '员工内推']
const channelOther = ref('')

const form = reactive({
  realName: '',
  phone: '',
  channel: '',
  answers: {},  // { fieldId: value }
})

const uploadedFiles = reactive({}) // { fieldId: [url, ...] }

const isDeadlineSoon = computed(() => {
  if (!project.value?.deadline) return false
  return new Date(project.value.deadline) - new Date() < 3 * 24 * 60 * 60 * 1000
})

const showChannel = computed(() => {
  return project.value?.fields?.some(f => f.validation?.channelTag)
})

const statusTagMap = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'info' }
const statusLabelMap = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已拒绝', CANCELLED: '已取消' }
const payTagMap = { FREE: 'success', UNPAID: 'warning', PAID: 'success', REFUNDED: 'info' }
const payLabelMap = { FREE: '免费', UNPAID: '待支付', PAID: '已支付', REFUNDED: '已退款' }

// 表单验证规则
const rules = {
  realName: [{ required: true, message: '请填写真实姓名', trigger: 'blur' }],
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' },
  ],
}

// 根据字段定义生成校验规则
function buildRules(field) {
  if (!field.required) return []
  return [{ required: true, message: `请填写${field.label}`, trigger: 'change' }]
}

function formatDT(d) {
  return d ? new Date(d).toLocaleString('zh-CN') : ''
}

function getFileName(url) {
  return decodeURIComponent(url.split('/').pop())
}

function beforeUpload(file, fieldId) {
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('文件大小不能超过 20MB')
    return false
  }
  return true
}

function onUploadSuccess(response, file, fieldId) {
  const url = response.data?.url || response.data?.urls?.[0]
  if (!url) { ElMessage.error('上传失败，未获取到文件地址'); return }
  if (!uploadedFiles[fieldId]) uploadedFiles[fieldId] = []
  uploadedFiles[fieldId].push(url)
  // 同步到 answers
  form.answers[fieldId] = uploadedFiles[fieldId]
  ElMessage.success('上传成功')
}

function onUploadError() {
  ElMessage.error('文件上传失败，请重试')
}

async function removeFile(fieldId, index, url) {
  uploadedFiles[fieldId].splice(index, 1)
  form.answers[fieldId] = uploadedFiles[fieldId]
  try { await uploadApi.remove(url) } catch {}
}

async function handleSubmit() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  // 检查必填动态字段
  for (const field of project.value.fields) {
    if (field.required) {
      const val = form.answers[field.id]
      if (field.fieldType === 'CHECKBOX') {
        if (!val || val.length === 0) {
          ElMessage.error(`请填写「${field.label}」`)
          return
        }
      } else {
        if (!val) {
          ElMessage.error(`请填写「${field.label}」`)
          return
        }
      }
    }
  }

  // 如果有自定义渠道输入
  let channel = form.channel
  if (form.channel === '__other__' && channelOther.value.trim()) {
    channel = channelOther.value.trim()
  }

  submitting.value = true
  try {
    const payload = {
      realName: form.realName,
      phone: form.phone,
      channel,
      answers: { ...form.answers },
    }
    // 将文件数组答案转为字符串
    for (const [k, v] of Object.entries(payload.answers)) {
      if (Array.isArray(v)) payload.answers[k] = JSON.stringify(v)
    }
    const res = await regApi.submit(projectId.value, payload)
    alreadyRegistered.value = true
    editMode.value = false
    ElMessage.success(res.data?.message || '报名成功')
    // 刷新我的报名
    const allMine = await regApi.mineAll().catch(() => null)
    if (allMine) {
      myRegistration.value = allMine.data?.find(r => r.projectId === projectId.value)
    }
  } finally {
    submitting.value = false
  }
}

async function handleCancel() {
  try {
    await ElMessageBox.confirm('确定要取消报名吗？', '提示', { type: 'warning' })
    await regApi.cancel(projectId.value)
    ElMessage.success('已取消报名')
    alreadyRegistered.value = false
    myRegistration.value = null
  } catch {}
}

onMounted(async () => {
  // 加载项目
  const projRes = await projectApi.detail(projectId.value)
  project.value = projRes.data

  // 检查是否已报名
  const mine = await regApi.mineAll().catch(() => null)
  if (mine?.data) {
    const found = mine.data.find(r => r.projectId === projectId.value)
    if (found) {
      alreadyRegistered.value = true
      myRegistration.value = found
      form.realName = found.realName
      form.phone = found.phone
      form.channel = found.channel || ''
      form.answers = found.answers || {}
    }
  }
})
</script>

<style scoped>
.reg-form-page { max-width: 800px; margin: 0 auto; padding: 0 12px; }
.project-header { display: flex; gap: 20px; margin-bottom: 20px; align-items: flex-start; flex-wrap: wrap; }
.project-cover { flex-shrink: 0; }
.project-cover img { width: 200px; max-width: 100%; border-radius: 8px; display: block; }
.project-info h2 { margin-top: 0; }
.project-meta { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.project-content { font-size: 14px; color: #555; line-height: 1.7; }
.form-card { margin-top: 16px; }
.file-upload-area { display: flex; flex-direction: column; gap: 8px; }
.uploaded-list { display: flex; flex-direction: column; gap: 6px; }
.uploaded-file {
  display: flex; justify-content: space-between; align-items: center;
  background: #f5f7fa; padding: 6px 12px; border-radius: 4px; font-size: 13px;
}
.upload-tip { font-size: 12px; color: #aaa; }
.registered-card { margin-top: 16px; text-align: center; }
</style>
