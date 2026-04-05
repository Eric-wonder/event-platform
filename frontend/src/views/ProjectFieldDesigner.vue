<template>
  <el-card>
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span>表单字段设计器 — {{ projectTitle }}</span>
        <el-button type="primary" size="small" @click="saveAll" :loading="saving">保存全部</el-button>
      </div>
    </template>

    <el-alert
      v-if="savedFields.length > 0"
      :title="`已保存 ${savedFields.length} 个字段，修改后需重新保存`"
      type="info" :closable="false" style="margin-bottom:16px"
    />

    <el-row :gutter="20">
      <!-- 左侧：字段列表 -->
      <el-col :span="14">
        <div class="field-list">
          <el-empty v-if="fields.length === 0" description="暂无字段，点击上方添加">
            <el-button type="primary" @click="addField">+ 添加第一个字段</el-button>
          </el-empty>

          <draggable
            v-else
            v-model="fields"
            item-key="tempId"
            handle=".drag-handle"
            ghost-class="ghost"
            animation="200"
            @end="onDragEnd"
          >
            <template #item="{ element, index }">
              <div class="field-card">
                <div class="field-card-header">
                  <span class="drag-handle">☰</span>
                  <span class="field-index">{{ index + 1 }}</span>
                  <el-tag size="small" :type="typeTagMap[element.fieldType]">
                    {{ typeLabelMap[element.fieldType] }}
                  </el-tag>
                  <span class="field-label">{{ element.label || '未命名字段' }}</span>
                  <span v-if="element.required" class="required-star">*</span>
                  <div class="field-actions">
                    <el-button text size="small" @click="editField(element)">编辑</el-button>
                    <el-popconfirm title="确定删除此字段？" @confirm="removeField(index)">
                      <template #reference>
                        <el-button text size="small" type="danger">删除</el-button>
                      </template>
                    </el-popconfirm>
                  </div>
                </div>

                <!-- 快捷配置行 -->
                <div class="field-quick-config">
                  <el-input
                    v-model="element.label"
                    placeholder="字段名（如：姓名）"
                    size="small"
                    style="width:160px"
                  />
                  <el-select v-model="element.fieldType" size="small" style="width:120px" @change="onTypeChange(element)">
                    <el-option v-for="t in fieldTypes" :key="t.value" :label="t.label" :value="t.value" />
                  </el-select>
                  <el-checkbox v-model="element.required" size="small">必填</el-checkbox>
                </div>

                <!-- 选项配置（SELECT/RADIO/CHECKBOX） -->
                <div v-if="['SELECT','RADIO','CHECKBOX'].includes(element.fieldType)" class="field-options">
                  <span class="options-label">选项：</span>
                  <el-tag
                    v-for="(opt, oi) in element.options" :key="oi"
                    closable size="small" style="margin-right:4px"
                    @close="element.options.splice(oi,1)"
                  >{{ opt }}</el-tag>
                  <el-input
                    v-model="newOption[element.tempId]"
                    size="small" style="width:100px"
                    placeholder="输入选项"
                    @keydown.enter.prevent="addOption(element)"
                  >
                    <template #append>
                      <el-button @click="addOption(element)">+</el-button>
                    </template>
                  </el-input>
                </div>

                <!-- 扩展属性 -->
                <div class="field-extra">
                  <el-popover placement="bottom" :width="360" trigger="click">
                    <template #reference>
                      <el-button text size="small" type="info">⚙ 扩展属性</el-button>
                    </template>
                    <div class="extra-config">
                      <p class="extra-title">校验规则</p>
                      <el-form label-width="80px" size="small">
                        <el-form-item label="最小长度">
                          <el-input-number v-model="element.validation.minLength" :min="0" placeholder="字符数" />
                        </el-form-item>
                        <el-form-item label="最大长度">
                          <el-input-number v-model="element.validation.maxLength" :min="0" placeholder="字符数" />
                        </el-form-item>
                        <el-form-item label="正则">
                          <el-input v-model="element.validation.pattern" placeholder="如：^\d{18}$" />
                        </el-form-item>
                        <el-form-item label="数字最小">
                          <el-input-number v-model="element.validation.min" placeholder="数值最小" />
                        </el-form-item>
                        <el-form-item label="数字最大">
                          <el-input-number v-model="element.validation.max" placeholder="数值最大" />
                        </el-form-item>
                        <el-form-item label="提示文字">
                          <el-input v-model="element.placeholder" placeholder="占位提示" />
                        </el-form-item>
                      </el-form>
                    </div>
                  </el-popover>

                  <!-- 分销渠道标记（特殊扩展属性） -->
                  <el-popover placement="bottom" :width="320" trigger="click">
                    <template #reference>
                      <el-button text size="small" type="success">🏷 渠道标记</el-button>
                    </template>
                    <div>
                      <p style="margin:0 0 12px;font-weight:bold">分销渠道扩展属性</p>
                      <el-input v-model="element.validation.channelTag" placeholder="如：promotion_code" size="small" />
                      <p style="color:#888;font-size:12px;margin:4px 0 8px">设置后前端会展示渠道选择框并自动填充此值</p>
                      <el-select v-model="element.validation.channelOptions" multiple size="small" placeholder="预设渠道选项" allow-create filterable style="width:100%">
                        <el-option v-for="c in channelOptions" :key="c" :label="c" :value="c" />
                      </el-select>
                    </div>
                  </el-popover>
                </div>
              </div>
            </template>
          </draggable>

          <el-button v-if="fields.length > 0" type="primary" plain style="margin-top:12px" @click="addField">
            ➕ 添加字段
          </el-button>
        </div>
      </el-col>

      <!-- 右侧：实时预览 -->
      <el-col :span="10">
        <div class="preview-panel">
          <div class="preview-title">📋 表单预览</div>
          <div class="preview-form">
            <div v-for="(f, idx) in fields" :key="f.tempId" class="preview-item">
              <div class="preview-label">
                {{ f.label || `字段${idx+1}` }}
                <span v-if="f.required" style="color:#f56c6c">*</span>
              </div>
              <!-- TEXT -->
              <el-input v-if="f.fieldType === 'TEXT'" :placeholder="f.placeholder" disabled />
              <!-- TEXTAREA -->
              <el-input v-else-if="f.fieldType === 'TEXTAREA'" type="textarea" :rows="3" :placeholder="f.placeholder" disabled />
              <!-- SELECT -->
              <el-select v-else-if="f.fieldType === 'SELECT'" :placeholder="f.placeholder || '请选择'" disabled style="width:100%">
                <el-option v-for="o in f.options" :key="o" :label="o" :value="o" />
              </el-select>
              <!-- RADIO -->
              <el-radio-group v-else-if="f.fieldType === 'RADIO'" disabled>
                <el-radio v-for="o in f.options" :key="o" :label="o">{{ o }}</el-radio>
              </el-radio-group>
              <!-- CHECKBOX -->
              <el-checkbox-group v-else-if="f.fieldType === 'CHECKBOX'" disabled>
                <el-checkbox v-for="o in f.options" :key="o" :label="o">{{ o }}</el-checkbox>
              </el-checkbox-group>
              <!-- DATE -->
              <el-date-picker v-else-if="f.fieldType === 'DATE'" type="date" placeholder="选择日期" disabled style="width:100%" />
              <!-- FILE -->
              <div v-else-if="f.fieldType === 'FILE'" class="preview-file">
                <el-button size="small" disabled>选择文件</el-button>
                <span style="font-size:12px;color:#999">（仅在正式表单中可用）</span>
              </div>
              <div class="preview-type-tag">{{ typeLabelMap[f.fieldType] }}</div>
            </div>
            <div v-if="fields.length === 0" style="color:#bbb;text-align:center;padding:40px 0">
              添加字段后在此预览
            </div>
          </div>
        </div>
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { fieldApi, projectApi } from '../api/client'
import draggable from 'vuedraggable'

const route = useRoute()
const router = useRouter()

const projectId = computed(() => Number(route.params.id))
const projectTitle = ref('')
const fields = ref([])
const savedFields = ref([])
const saving = ref(false)
const newOption = reactive({})

const typeLabelMap = {
  TEXT: '文本', TEXTAREA: '多行文本', SELECT: '下拉', RADIO: '单选',
  CHECKBOX: '多选', DATE: '日期', FILE: '文件上传',
}
const typeTagMap = {
  TEXT: '', TEXTAREA: 'warning', SELECT: 'success', RADIO: 'primary',
  CHECKBOX: 'info', DATE: '', FILE: 'danger',
}
const fieldTypes = Object.entries(typeLabelMap).map(([value, label]) => ({ value, label }))
const channelOptions = ['官网', '公众号', '小程序', '朋友圈', '线下地推', '合作渠道', '员工内推']

// 生成临时 ID（用于前端唯一标识，保存后替换为数据库 ID）
let tempIdCounter = 1
function newTempId() { return `temp_${tempIdCounter++}` }

function makeField(overrides = {}) {
  return reactive({
    tempId: newTempId(),
    label: '',
    fieldType: 'TEXT',
    required: false,
    placeholder: '',
    options: [],
    sortOrder: fields.value.length,
    validation: reactive({}),
    ...overrides,
  })
}

function addField() {
  fields.value.push(makeField())
}

function editField(field) {
  ElMessage.info('在下方直接编辑，或通过右侧「扩展属性」配置高级选项')
}

function removeField(index) {
  fields.value.splice(index, 1)
}

function onTypeChange(field) {
  if (!['SELECT', 'RADIO', 'CHECKBOX'].includes(field.fieldType)) {
    field.options = []
  }
}

function addOption(field) {
  const val = newOption[field.tempId]
  if (val && val.trim()) {
    field.options.push(val.trim())
    newOption[field.tempId] = ''
  }
}

function onDragEnd() {
  // 更新 sortOrder
  fields.value.forEach((f, i) => { f.sortOrder = i })
}

async function saveAll() {
  if (fields.value.some(f => !f.label.trim())) {
    ElMessage.error('字段名称不能为空')
    return
  }
  saving.value = true
  try {
    const payload = fields.value.map((f, i) => ({
      label: f.label,
      fieldType: f.fieldType,
      required: f.required,
      placeholder: f.placeholder,
      options: f.options,
      sortOrder: i,
      validation: f.validation,
    }))
    const res = await fieldApi.batchSave(projectId.value, payload)
    savedFields.value = res.data
    ElMessage.success(res.message || '保存成功')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  // 加载项目信息
  const proj = await projectApi.detail(projectId.value)
  projectTitle.value = proj.data.title

  // 加载已有字段
  const res = await fieldApi.list(projectId.value)
  fields.value = res.data.map(f => {
    const field = reactive({
      tempId: `db_${f.id}`,
      label: f.label,
      fieldType: f.fieldType,
      required: f.required,
      placeholder: f.placeholder || '',
      options: f.options || [],
      sortOrder: f.sortOrder,
      validation: reactive(f.validation || {}),
    })
    savedFields.value.push(field)
    return field
  })
})
</script>

<style scoped>
.field-list { min-height: 200px; }
.field-card {
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
  background: #fff;
  transition: box-shadow 0.2s;
}
.field-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
.field-card-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px;
}
.drag-handle { cursor: grab; color: #ccc; font-size: 16px; padding: 0 4px; }
.field-index { color: #999; font-size: 12px; }
.field-label { font-weight: 500; flex: 1; }
.required-star { color: #f56c6c; font-size: 14px; }
.field-actions { display: flex; gap: 4px; }
.field-quick-config { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.field-options { margin-top: 8px; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.options-label { font-size: 13px; color: #666; }
.field-extra { margin-top: 8px; display: flex; gap: 8px; }
.ghost { opacity: 0.4; background: #e6f7ff; border: 2px dashed #1890ff; }
.preview-panel {
  border: 2px dashed #e8e8e8;
  border-radius: 12px;
  padding: 16px;
  background: #fafafa;
  position: sticky; top: 16px;
}
.preview-title { font-weight: bold; margin-bottom: 12px; color: #333; }
.preview-form { display: flex; flex-direction: column; gap: 14px; }
.preview-item { position: relative; }
.preview-label { font-size: 14px; color: #333; margin-bottom: 4px; font-weight: 500; }
.preview-type-tag { font-size: 11px; color: #aaa; margin-top: 2px; }
.preview-file { display: flex; align-items: center; gap: 8px; }
.extra-config { padding: 4px 0; }
.extra-title { font-weight: bold; margin-bottom: 12px; color: #333; }
</style>
