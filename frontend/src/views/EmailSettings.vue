<template>
  <el-card>
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>📧 邮件设置</h3>
      </div>
    </template>

    <el-alert type="info" :closable="false" style="margin-bottom:20px">
      <b>SMTP 配置</b>（环境变量，仅管理员可见）：<br>
      <code style="font-size:12px">SMTP_HOST={{ form.smtpHost || '未配置' }}&nbsp;&nbsp; SMTP_PORT={{ form.smtpPort || '未配置' }}&nbsp;&nbsp; SMTP_USER={{ form.smtpUser || '未配置' }}&nbsp;&nbsp; SMTP_PASS={{ form.smtpHasPass ? '******' : '❌ 未配置' }}</code>
    </el-alert>

    <el-form ref="formRef" :model="form" label-width="140px" style="max-width:640px">

      <!-- 收件邮箱列表 -->
      <el-form-item label="收件邮箱列表" required>
        <div style="width:100%">
          <div v-for="(email, i) in form.toEmails" :key="i" style="display:flex;gap:8px;margin-bottom:8px">
            <el-input v-model="form.toEmails[i]" placeholder="example@qq.com" style="flex:1">
              <template #prepend>📧</template>
            </el-input>
            <el-button @click="form.toEmails.splice(i,1)" :disabled="form.toEmails.length<=1">删除</el-button>
          </div>
          <el-button size="small" @click="form.toEmails.push('')">➕ 添加邮箱</el-button>
        </div>
      </el-form-item>

      <!-- 定时任务开关 -->
      <el-form-item label="每日汇总邮件">
        <el-switch v-model="form.cronEnabled" active-text="开启" inactive-text="关闭" />
      </el-form-item>

      <!-- 定时发送时间 -->
      <el-form-item label="发送时间" v-if="form.cronEnabled">
        <el-time-select
          v-model="form.cronTime"
          start="06:00"
          end="23:00"
          step="00:30"
          placeholder="选择时间"
          style="width:180px"
        />
        <div style="font-size:12px;color:#888;margin-top:4px">
          每天定时汇总当日所有报名数据，发送至收件邮箱
        </div>
      </el-form-item>

      <!-- 当前定时任务状态 -->
      <el-form-item label="任务状态">
        <el-tag :type="form.cronEnabled ? 'success' : 'info'">
          {{ form.cronEnabled ? `✅ 已启用（每天 ${form.cronTime} 执行）` : '⏸ 已关闭' }}
        </el-tag>
      </el-form-item>

      <!-- 操作按钮 -->
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="handleSave">💾 保存设置</el-button>
        <el-button @click="openTestDialog">📤 发送测试邮件</el-button>
        <el-button @click="fetchSettings">🔄 重置</el-button>
      </el-form-item>
    </el-form>

    <el-divider content-position="left">说明</el-divider>
    <el-alert type="warning" :closable="false" style="font-size:13px">
      <ul style="margin:4px 0;padding-left:18px">
        <li><b>SMTP 配置</b>通过环境变量设置（.env 文件），管理员可在服务器上修改，重启后生效</li>
        <li><b>收件邮箱</b>和<b>定时任务开关</b>存储在服务端 JSON 配置文件中，修改后实时生效</li>
        <li>QQ 邮箱需在设置中开启 <b>SMTP 服务</b>，并使用 <b>授权码</b>（非登录密码）作为 SMTP_PASS</li>
        <li>授权码获取：QQ 邮箱网页版 → 设置 → 账户 → POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV服务 → 生成授权码</li>
      </ul>
    </el-alert>

    <!-- .env 配置示例 -->
    <el-divider content-position="left">.env 配置示例</el-divider>
    <el-input type="textarea" :rows="5" readonly
      value="SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your-email@qq.com
SMTP_PASS=your-auth-code"
      style="font-family:monospace;font-size:12px"
    />
  </el-card>

  <!-- 测试邮件弹窗 -->
  <el-dialog v-model="testDialogVisible" title="发送测试邮件" width="420px">
    <el-form-item label="收件邮箱" required>
      <el-input v-model="testEmail" placeholder="example@qq.com" />
    </el-form-item>
    <template #footer>
      <el-button @click="testDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="sendingTest" @click="sendTestEmail">发送</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { emailApi } from '../api/client'

const loading = ref(false)
const saving = ref(false)
const testDialogVisible = ref(false)
const sendingTest = ref(false)
const testEmail = ref('')
const formRef = ref()

const form = reactive({
  smtpHost: '',
  smtpPort: 465,
  smtpUser: '',
  smtpHasPass: false,
  toEmails: [],
  cronEnabled: false,
  cronTime: '09:00',
})

const fetchSettings = async () => {
  loading.value = true
  try {
    const res = await emailApi.getSettings()
    Object.assign(form, res.data)
  } finally { loading.value = false }
}

const handleSave = async () => {
  const validEmails = form.toEmails.filter(e => e.trim())
  if (validEmails.length === 0) {
    ElMessage.error('请至少填写一个有效收件邮箱')
    return
  }
  saving.value = true
  try {
    await emailApi.saveSettings({
      toEmails: validEmails,
      cronEnabled: form.cronEnabled,
      cronTime: form.cronTime,
    })
    ElMessage.success('设置已保存')
  } finally { saving.value = false }
}

const openTestDialog = () => {
  testEmail.value = form.toEmails[0] || ''
  testDialogVisible.value = true
}

const sendTestEmail = async () => {
  if (!testEmail.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail.value)) {
    ElMessage.error('请输入有效邮箱地址')
    return
  }
  sendingTest.value = true
  try {
    await emailApi.sendTest(testEmail.value)
    ElMessage.success('测试邮件发送成功，请查收')
    testDialogVisible.value = false
  } finally { sendingTest.value = false }
}

onMounted(fetchSettings)
</script>
