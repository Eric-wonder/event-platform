<template>
  <div class="site-settings">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>🌐 网站设置</span>
        </div>
      </template>

      <el-form ref="formRef" :model="form" label-width="140px" style="max-width:600px">
        <el-form-item label="网站名称">
          <el-input v-model="form.siteName" placeholder="活动平台" />
        </el-form-item>

        <el-form-item label="网站 Logo">
          <div style="display:flex;gap:12px;align-items:center">
            <el-image v-if="form.siteLogo" :src="form.siteLogo" fit="contain" style="width:80px;height:80px;border-radius:8px;border:1px solid #eee" />
            <el-button @click="showUpload = true">选择图片</el-button>
          </div>
        </el-form-item>

        <el-form-item label="网站描述">
          <el-input v-model="form.siteDescription" type="textarea" :rows="3" placeholder="简洁描述您的平台..." />
        </el-form-item>

        <el-form-item label="ICP备案号">
          <el-input v-model="form.icpNumber" placeholder="如：京ICP备12345678号" />
        </el-form-item>

        <el-form-item label="联系邮箱">
          <el-input v-model="form.contactEmail" placeholder="support@example.com" />
        </el-form-item>

        <el-form-item label="联系电话">
          <el-input v-model="form.contactPhone" placeholder="400-xxx-xxxx" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="handleSave">💾 保存设置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 图片上传对话框 -->
    <el-dialog v-model="showUpload" title="选择图片" width="500px">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="上传图片" name="upload">
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :limit="1"
            accept="image/*"
            :on-change="handleFileChange"
            list-type="picture"
            style="width:100%"
          >
            <el-button type="primary">点击上传</el-button>
            <template #tip>
              <div style="margin-top:8px;color:#999;font-size:12px">支持 jpg、png、gif、svg，建议尺寸 200x60</div>
            </template>
          </el-upload>
        </el-tab-pane>
        <el-tab-pane label="输入链接" name="url">
          <el-input v-model="imageUrl" placeholder="https://example.com/logo.png" clearable style="width:100%" />
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="showUpload = false">取消</el-button>
        <el-button type="primary" @click="confirmImage">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { siteApi, uploadApi } from '../api/client'

const loading = ref(false)
const saving = ref(false)
const showUpload = ref(false)
const activeTab = ref('upload')
const imageUrl = ref('')
const uploadRef = ref()

const form = reactive({
  siteName: '',
  siteLogo: '',
  siteDescription: '',
  icpNumber: '',
  contactEmail: '',
  contactPhone: '',
})

const fetchSettings = async () => {
  loading.value = true
  try {
    const res = await siteApi.get()
    if (res.data) {
      Object.keys(form).forEach(key => {
        if (res.data[key] !== undefined) form[key] = res.data[key]
      })
    }
  } finally { loading.value = false }
}

const handleSave = async () => {
  if (!form.siteName) {
    ElMessage.error('请填写网站名称')
    return
  }
  saving.value = true
  try {
    await siteApi.save(form)
    ElMessage.success('网站设置已保存')
    // 通知 Layout 刷新
    window.dispatchEvent(new Event('site-settings-updated'))
  } finally { saving.value = false }
}

const handleFileChange = async (file) => {
  const raw = file.raw
  if (!raw) return
  const formData = new FormData()
  formData.append('file', raw)
  try {
    const res = await uploadApi.image(formData)
    if (res.data?.url) {
      form.siteLogo = res.data.url
      showUpload.value = false
      ElMessage.success('图片上传成功')
    }
  } catch (err) {
    ElMessage.error('上传失败: ' + (err.response?.data?.message || err.message))
  }
}

const confirmImage = () => {
  if (activeTab.value === 'url') {
    if (!imageUrl.value) {
      ElMessage.warning('请输入图片链接')
      return
    }
    form.siteLogo = imageUrl.value
    imageUrl.value = ''
  }
  showUpload.value = false
}

onMounted(() => {
  fetchSettings()
})
</script>

<style scoped>
.site-settings {
  max-width: 800px;
}
.card-header {
  font-size: 16px;
  font-weight: 600;
}
</style>