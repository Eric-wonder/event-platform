<template>
  <el-card>
    <template #header><h3>发布活动</h3></template>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
      <el-form-item label="活动标题" prop="title">
        <el-input v-model="form.title" placeholder="输入活动名称" />
      </el-form-item>
      <el-form-item label="分类" prop="category">
        <el-select v-model="form.category" placeholder="选择分类">
          <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
        </el-select>
      </el-form-item>
      <el-form-item label="活动描述" prop="description">
        <el-input v-model="form.description" type="textarea" :rows="5" placeholder="详细描述活动内容" />
      </el-form-item>
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="最大人数" prop="maxCapacity">
            <el-input-number v-model="form.maxCapacity" :min="1" :max="100000" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="报名费用(元)" prop="fee">
            <el-input-number v-model="form.fee" :min="0" :precision="2" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="活动地点" prop="location">
        <el-input v-model="form.location" placeholder="详细地址" />
      </el-form-item>
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="开始时间" prop="startTime">
            <el-date-picker v-model="form.startTime" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss[Z]" style="width:100%" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="结束时间" prop="endTime">
            <el-date-picker v-model="form.endTime" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss[Z]" style="width:100%" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="报名截止" prop="regDeadline">
            <el-date-picker v-model="form.regDeadline" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss[Z]" style="width:100%" />
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 自定义表单字段 -->
      <el-divider>自定义报名字段（可选）</el-divider>
      <div v-for="(field, idx) in form.formFields" :key="idx" class="field-item">
        <el-form-item label="字段名">
          <el-input v-model="field.label" placeholder="如：紧急联系人" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="field.fieldType">
            <el-option label="文本" value="TEXT" />
            <el-option label="多行文本" value="TEXTAREA" />
            <el-option label="下拉选择" value="SELECT" />
            <el-option label="单选" value="RADIO" />
            <el-option label="多选" value="CHECKBOX" />
            <el-option label="日期" value="DATE" />
          </el-select>
        </el-form-item>
        <el-form-item label="选项(逗号分隔)" v-if="['SELECT','RADIO','CHECKBOX'].includes(field.fieldType)">
          <el-input v-model="field.optionsRaw" placeholder="选项1,选项2,选项3" />
        </el-form-item>
        <el-form-item label="必填">
          <el-switch v-model="field.required" />
        </el-form-item>
        <el-button type="danger" size="small" @click="form.formFields.splice(idx,1)">删除字段</el-button>
        <el-divider />
      </div>
      <el-button @click="form.formFields.push({ label:'', fieldType:'TEXT', required:false, optionsRaw:'' })">+ 添加字段</el-button>

      <el-form-item style="margin-top:24px">
        <el-button type="primary" :loading="loading" @click="handleSubmit">创建活动</el-button>
        <el-button @click="$router.back()">取消</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { activityApi } from '../api/client'

const router = useRouter()
const formRef = ref()
const loading = ref(false)
const categories = ['体育竞技', '公益活动', '教育培训', '文化艺术', '商务交流']
const form = reactive({
  title: '', category: '', description: '', maxCapacity: 100, fee: 0,
  location: '', startTime: '', endTime: '', regDeadline: '',
  formFields: [],
})

const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
  description: [{ required: true, message: '请输入描述', trigger: 'blur' }],
  maxCapacity: [{ required: true, message: '请设置人数', trigger: 'blur' }],
  location: [{ required: true, message: '请输入地点', trigger: 'blur' }],
  startTime: [{ required: true, message: '请选择开始时间', trigger: 'change' }],
  endTime: [{ required: true, message: '请选择结束时间', trigger: 'change' }],
  regDeadline: [{ required: true, message: '请选择报名截止时间', trigger: 'change' }],
}

const handleSubmit = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const payload = {
      ...form,
      formFields: form.formFields
        .filter(f => f.label)
        .map(f => ({
          label: f.label,
          fieldType: f.fieldType,
          required: f.required,
          options: f.optionsRaw ? f.optionsRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        })),
    }
    const res = await activityApi.create(payload)
    ElMessage.success('活动创建成功')
    router.push(`/activities/${res.data.id}`)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.field-item {
  background: #f9f9f9;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 12px;
}
</style>
