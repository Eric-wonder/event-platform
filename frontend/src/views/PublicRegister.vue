<template>
  <div class="public-register">
    <div class="register-card">
      <h1 class="title">{{ project?.title || '活动报名' }}</h1>

      <!-- 加载中 -->
      <div v-if="loading" class="loading">加载中...</div>
      <!-- 项目不存在 -->
      <div v-else-if="error" class="error">{{ error }}</div>

      <!-- 已报名状态 -->
      <template v-else-if="registered">
        <div class="status-box" :class="registered.status.toLowerCase()">
          <div class="status-icon">
            <span v-if="registered.status === 'PENDING'">⏳</span>
            <span v-else-if="registered.status === 'APPROVED'">✅</span>
            <span v-else-if="registered.status === 'REJECTED'">❌</span>
            <span v-else>ℹ️</span>
          </div>
          <div class="status-text">
            <strong>{{ statusText }}</strong>
            <p>报名时间：{{ formatDate(registered.createdAt) }}</p>
            <p style="margin-top:8px">姓名：{{ registered.realName }}</p>
          </div>
        </div>
      </template>

      <!-- 报名表单 -->
      <form v-else @submit.prevent="handleSubmit" class="register-form">
        <div class="form-group">
          <label>姓名 <span class="required">*</span></label>
          <input v-model="form.realName" type="text" placeholder="请输入真实姓名" required />
        </div>

        <div class="form-group">
          <label>手机号 <span class="required">*</span></label>
          <input v-model="form.phone" type="tel" placeholder="请输入手机号" required minlength="11" maxlength="20" />
        </div>

        <div class="form-group">
          <label>邮箱</label>
          <input v-model="form.email" type="email" placeholder="请输入邮箱（选填）" />
        </div>

        <!-- 项目自定义字段 -->
        <div v-for="field in project.fields" :key="field.id" class="form-group">
          <label>
            {{ field.label }}
            <span v-if="field.required" class="required">*</span>
          </label>

          <input
            v-if="field.fieldType === 'TEXT'"
            v-model="form.answers[field.id]"
            type="text"
            :placeholder="field.placeholder"
            :required="field.required"
          />

          <textarea
            v-else-if="field.fieldType === 'TEXTAREA'"
            v-model="form.answers[field.id]"
            :placeholder="field.placeholder"
            :required="field.required"
          ></textarea>

          <select
            v-else-if="field.fieldType === 'SELECT'"
            v-model="form.answers[field.id]"
            :required="field.required"
          >
            <option value="">请选择</option>
            <option v-for="opt in parseOptions(field.options)" :key="opt" :value="opt">{{ opt }}</option>
          </select>

          <div v-else-if="field.fieldType === 'RADIO'" class="radio-group">
            <label v-for="opt in parseOptions(field.options)" :key="opt">
              <input v-model="form.answers[field.id]" type="radio" :value="opt" :required="field.required" />
              {{ opt }}
            </label>
          </div>

          <div v-else-if="field.fieldType === 'CHECKBOX'" class="checkbox-group">
            <label v-for="opt in parseOptions(field.options)" :key="opt">
              <input v-model="form.answers[field.id]" type="checkbox" :value="opt" />
              {{ opt }}
            </label>
          </div>
        </div>

        <div v-if="submitError" class="form-error">{{ submitError }}</div>

        <button type="submit" class="submit-btn" :disabled="submitting">
          {{ submitting ? '提交中...' : '立即报名' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { publicRegApi } from '../api/client'

const route = useRoute()
const projectId = route.params.projectId

const loading = ref(true)
const error = ref('')
const submitting = ref(false)
const submitError = ref('')
const registered = ref(null)
const project = ref(null)
const form = ref({
  realName: '',
  phone: '',
  email: '',
  answers: {},
})

const statusText = computed(() => {
  const map = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已拒绝', CANCELLED: '已取消' }
  return map[registered.value?.status] || '未知'
})

const parseOptions = (opts) => {
  if (!opts) return []
  try { return typeof opts === 'string' ? JSON.parse(opts) : opts } catch { return [] }
}

const formatDate = (d) => new Date(d).toLocaleString('zh-CN')

const fetchProject = async () => {
  try {
    const res = await publicRegApi.getProject(projectId)
    project.value = res.data
    const answers = {}
    project.value.fields?.forEach(f => { answers[f.id] = '' })
    form.value.answers = answers
  } catch {
    error.value = '项目不存在'
  } finally {
    loading.value = false
  }
}

const handleSubmit = async () => {
  submitting.value = true
  submitError.value = ''
  try {
    const payload = {
      realName: form.value.realName,
      phone: form.value.phone,
      email: form.value.email || undefined,
      answers: form.value.answers,
    }
    const res = await publicRegApi.submit(projectId, payload)
    registered.value = res.data
  } catch (e) {
    submitError.value = e.response?.data?.message || '报名失败，请重试'
  } finally {
    submitting.value = false
  }
}

onMounted(fetchProject)
</script>

<style scoped>
.public-register {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40px 20px;
}

.register-card {
  max-width: 600px;
  margin: 0 auto;
  background: #fff;
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
}

.title {
  text-align: center;
  margin-bottom: 30px;
  color: #333;
  font-size: 24px;
}

.loading, .error { text-align: center; padding: 40px; color: #666; }
.error { color: #e74c3c; }

.form-group { margin-bottom: 20px; }
.form-group label { display: block; margin-bottom: 8px; font-weight: 500; color: #333; }
.required { color: #e74c3c; }

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.3s;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: #667eea;
}

.radio-group, .checkbox-group { display: flex; flex-wrap: wrap; gap: 12px; }
.radio-group label, .checkbox-group label { display: flex; align-items: center; gap: 6px; font-weight: normal; cursor: pointer; }

.form-error { color: #e74c3c; margin-bottom: 16px; text-align: center; }

.submit-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(102,126,234,0.4); }
.submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.status-box { text-align: center; padding: 30px; border-radius: 12px; }
.status-box.pending { background: #fff3cd; }
.status-box.approved { background: #d4edda; }
.status-box.rejected { background: #f8d7da; }
.status-icon { font-size: 48px; margin-bottom: 16px; }
.status-text strong { display: block; font-size: 18px; margin-bottom: 8px; }
.status-text p { color: #666; font-size: 14px; }
</style>
