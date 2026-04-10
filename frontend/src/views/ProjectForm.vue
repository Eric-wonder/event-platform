<template>
  <div class="project-form-page">
    <el-card>
      <template #header>
        <h3>{{ isEdit ? '编辑报名项目' : '创建报名项目' }}</h3>
      </template>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <!-- 基本信息 -->
        <el-divider content-position="left">基本信息</el-divider>

        <el-form-item label="项目标题" prop="title">
          <el-input v-model="form.title" placeholder="请输入报名项目名称" maxlength="200" show-word-limit />
        </el-form-item>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="报名费用" prop="price">
              <el-input-number v-model="form.price" :min="0" :precision="2" :step="0.01" style="width:100%" />
              <span style="margin-left:8px;color:#888">元（设为0则为免费）</span>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="报名截止" prop="deadline">
              <el-date-picker
                v-model="form.deadline"
                type="datetime"
                placeholder="留空表示不限制截止时间"
                style="width:100%"
                value-format="YYYY-MM-DDTHH:mm:ss[Z]"
                :shortcuts="deadlineShortcuts"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="启用状态">
          <el-switch v-model="form.isEnabled" active-text="启用" inactive-text="停用" />
        </el-form-item>

        <!-- 封面图 -->
        <el-divider content-position="left">封面图</el-divider>

        <el-form-item label="封面图URL" prop="coverImage">
          <el-input v-model="form.coverImage" placeholder="输入图片URL或上传图片" />
          <div class="cover-preview" v-if="form.coverImage">
            <el-image :src="form.coverImage" fit="cover" style="width:200px;height:120px;border-radius:8px;margin-top:8px" />
          </div>
        </el-form-item>

        <el-form-item label="上传图片">
          <el-upload
            :action="uploadUrl"
            :headers="{ Authorization: `Bearer ${token}` }"
            :show-file-list="false"
            :on-success="handleUploadSuccess"
            :before-upload="beforeUpload"
            accept="image/*"
          >
            <el-button>选择图片上传</el-button>
            <template #tip>
              <div class="el-upload__tip">支持 jpg/png/webp，最大 5MB</div>
            </template>
          </el-upload>
        </el-form-item>

        <!-- 富文本内容 -->
        <el-divider content-position="left">项目详情（富文本）</el-divider>

        <el-form-item label="详情内容" prop="content">
          <div class="editor-wrap">
            <div ref="editorRef" class="wang-editor-container"></div>
          </div>
        </el-form-item>

        <!-- 操作按钮 -->
        <el-form-item style="margin-top:32px">
          <el-button type="primary" :loading="saving" size="large" @click="handleSubmit">
            {{ isEdit ? '保存修改' : '立即创建' }}
          </el-button>
          <el-button size="large" @click="$router.push('/admin/projects')">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 分享链接对话框 -->
    <el-dialog v-model="showShareDialog" title="报名项目创建成功" width="500px" :close-on-click-modal="false">
      <div style="text-align:center;padding:20px 0">
        <el-icon style="font-size:48px;color:#67c23a"><SuccessFilled /></el-icon>
        <h3 style="margin:16px 0">项目已创建成功！</h3>
        <p style="color:#888;margin-bottom:16px">复制下方链接分享给用户报名</p>
        <el-input v-model="shareLink" readonly style="margin-bottom:16px">
          <template #append>
            <el-button @click="copyShareLink">复制</el-button>
          </template>
        </el-input>
        <el-button type="primary" @click="goToProject">查看项目详情</el-button>
        <el-button @click="router.push('/admin/projects')">返回列表</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { SuccessFilled } from '@element-plus/icons-vue'
import { projectApi, uploadApi } from '../api/client'
import { useUserStore } from '../stores/user'
import E from 'wangeditor'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const formRef = ref()
const editorRef = ref()
const saving = ref(false)
const loading = ref(false)
const editor = ref(null)
const token = localStorage.getItem('token') || ''
const uploadUrl = `${import.meta.env.VITE_API_BASE_URL || '/api'}/upload/image`

const isEdit = computed(() => !!route.params.id)
const projectId = computed(() => Number(route.params.id))

const form = reactive({
  title: '',
  coverImage: '',
  content: '',
  price: 0,
  isEnabled: true,
  deadline: '',
})

const rules = {
  title: [{ required: true, message: '请输入项目标题', trigger: 'blur' }],
}

// 日期快捷选项
const deadlineShortcuts = [
  { text: '3天后', value: () => { const d = new Date(); d.setDate(d.getDate() + 3); return d; } },
  { text: '7天后', value: () => { const d = new Date(); d.setDate(d.getDate() + 7); return d; } },
  { text: '30天后', value: () => { const d = new Date(); d.setDate(d.getDate() + 30); return d; } },
]

// 图片上传
const beforeUpload = (file) => {
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('图片大小不能超过 5MB')
    return false
  }
  return true
}

const handleUploadSuccess = (res) => {
  if (res.code === 0) {
    form.coverImage = res.data.url
    ElMessage.success('上传成功')
  } else {
    ElMessage.error(res.message || '上传失败')
  }
}

// 初始化 wangEditor
const initEditor = (content = '') => {
  if (editor.value) {
    editor.value.destroy()
    editor.value = null
  }
  if (!editorRef.value) {
    console.warn('[Editor] editorRef not ready, retrying in 100ms...')
    setTimeout(() => initEditor(content), 100)
    return
  }
  try {
    editor.value = new E(editorRef.value)
    editor.value.config.uploadImgServer = `${import.meta.env.VITE_API_BASE_URL || '/api'}/upload/image`
    editor.value.config.uploadImgHeaders = { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
    editor.value.config.uploadFileName = 'file'
    editor.value.config.uploadImgHooks = {
      success: () => ElMessage.success('图片上传成功'),
      fail: () => ElMessage.error('图片上传失败'),
      error: () => ElMessage.error('图片上传出错'),
    }
    editor.value.config.placeholder = '请输入项目详情，支持文字、图片、表格等富文本格式...'
    editor.value.config.zIndex = 100
    editor.value.create()
    if (content) {
      editor.value.txt.html(content)
    }
    console.log('[Editor] wangEditor initialized successfully')
  } catch (e) {
    console.error('[Editor] wangEditor init failed:', e)
  }
}

// 加载编辑数据
const loadProject = async () => {
  if (!isEdit.value) return
  loading.value = true
  try {
    const res = await projectApi.detail(projectId.value)
    const p = res.data
    form.title = p.title
    form.coverImage = p.coverImage || ''
    form.content = p.content || ''
    form.price = p.price || 0
    form.isEnabled = p.isEnabled ?? true
    form.deadline = p.deadline ? new Date(p.deadline).toISOString().replace('Z', '') : ''
    // 等 DOM 渲染完再初始化编辑器
    setTimeout(() => initEditor(form.content), 100)
  } finally { loading.value = false }
}

// 分享链接相关
const showShareDialog = ref(false)
const shareLink = ref('')
const createdProjectId = ref(null)

const copyShareLink = () => {
  navigator.clipboard.writeText(shareLink.value)
  ElMessage.success('链接已复制到剪贴板')
}

const goToProject = () => {
  if (createdProjectId.value) {
    router.push(`/projects/${createdProjectId.value}`)
  }
}

// 提交
const handleSubmit = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  // 从编辑器取值
  const content = editor.value ? editor.value.txt.html() : form.content
  if (!content || content === '<p><br></p>') {
    ElMessage.error('请输入项目详情')
    return
  }

  saving.value = true
  try {
    const payload = {
      title: form.title,
      coverImage: form.coverImage,
      content,
      price: form.price,
      isEnabled: form.isEnabled,
      deadline: form.deadline || undefined,
    }

    if (isEdit.value) {
      await projectApi.update(projectId.value, payload)
      ElMessage.success('保存成功')
      router.push('/admin/projects')
    } else {
      const res = await projectApi.create(payload)
      ElMessage.success('创建成功')
      // 显示分享链接
      createdProjectId.value = res.data?.id
      shareLink.value = `${window.location.origin}/projects/${createdProjectId.value}`
      showShareDialog.value = true
    }
  } catch {
    // 错误已在拦截器处理
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    await loadProject()
    // 确保 DOM 渲染完成后再初始化编辑器
    await nextTick()
    // 等待两帧确保 wangEditor 容器完全就绪
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!isEdit.value) {
          initEditor()
        }
      })
    })
  } catch (e) {
    console.warn('编辑器初始化失败:', e)
  }
})

onBeforeUnmount(() => {
  if (editor.value) {
    editor.value.destroy()
    editor.value = null
  }
})
</script>

<style scoped>
.project-form-page { max-width: 900px; }
.editor-wrap {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
}
.wang-editor-container {
  min-height: 400px;
  z-index: 1;
}
.cover-preview img { border: 1px solid #eee; }
</style>
