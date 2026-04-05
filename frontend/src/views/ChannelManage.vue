<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3>分销渠道管理</h3>
          <el-button type="primary" @click="openCreate">➕ 新建渠道</el-button>
        </div>
      </template>

      <!-- 筛选 -->
      <el-row :gutter="12" style="margin-bottom:16px">
        <el-col :span="6">
          <el-input v-model="filters.keyword" placeholder="渠道名称/代码" clearable @change="fetchList" />
        </el-col>
        <el-col :span="4">
          <el-select v-model="filters.isEnabled" placeholder="状态" clearable @change="fetchList">
            <el-option label="启用" :value="true" />
            <el-option label="停用" :value="false" />
          </el-select>
        </el-col>
      </el-row>

      <!-- 表格 -->
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column label="渠道" min-width="200">
          <template #default="{ row }">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:20px">🏷</span>
              <div>
                <div style="font-weight:bold">{{ row.name }}</div>
                <div style="font-size:12px;color:#888">code: {{ row.code }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="默认佣金比例" width="140">
          <template #default="{ row }">
            <el-tag :type="row.rate > 0 ? 'success' : 'info'">{{ (row.rate * 100).toFixed(1) }}%</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="管理员数" width="100" prop="adminCount" />
        <el-table-column label="报名数" width="100" prop="registrationCount" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-switch :model-value="row.isEnabled" @change="toggleEnabled(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" text @click="openEdit(row)">编辑</el-button>
            <el-button size="small" text @click="openAdmins(row)">管理员</el-button>
            <el-button size="small" text type="info" @click="openCommission(row)">佣金</el-button>
            <el-popconfirm title="确定删除此渠道？" @confirm="handleDelete(row)">
              <template #reference>
                <el-button type="danger" size="small" text>删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination background layout="total,prev,pager,next"
          :total="total" :page-size="query.pageSize" :current-page="query.page"
          @current-change="p => { query.page = p; fetchList() }"
        />
      </div>
    </el-card>

    <!-- 创建/编辑渠道 -->
    <el-dialog v-model="formVisible" :title="editingChannel ? '编辑渠道' : '新建渠道'" width="480px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-form-item label="渠道名称" prop="name">
          <el-input v-model="form.name" placeholder="如：公众号渠道" maxlength="100" />
        </el-form-item>
        <el-form-item label="渠道代码" prop="code" v-if="!editingChannel">
          <el-input v-model="form.code" placeholder="唯一标识，如：wechat_official" maxlength="50" />
          <div style="font-size:12px;color:#888">用于表单中识别渠道，不可修改</div>
        </el-form-item>
        <el-form-item label="默认佣金比例" prop="rate">
          <el-input-number v-model="form.rate" :min="0" :max="1" :step="0.01" :precision="4" style="width:100%" />
          <div style="font-size:12px;color:#888">每笔订单中渠道管理员可获得的佣金比例（0 ~ 1）</div>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 管理员管理 -->
    <el-dialog v-model="adminVisible" :title="`管理员 — ${currentChannel?.name}`" width="560px">
      <div style="margin-bottom:12px">
        <el-button type="primary" size="small" @click="openAddAdmin">➕ 添加管理员</el-button>
      </div>
      <el-table :data="channelAdmins" v-loading="adminLoading" stripe size="small">
        <el-table-column prop="username" label="用户名" />
        <el-table-column prop="email" label="邮箱" />
        <el-table-column prop="phone" label="手机号" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-popconfirm title="确定移除此管理员？" @confirm="removeAdmin(row)">
              <template #reference>
                <el-button type="danger" size="small" text>移除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- 添加管理员 -->
    <el-dialog v-model="addAdminVisible" title="添加渠道管理员" width="440px">
      <el-alert type="info" :closable="false" style="margin-bottom:16px">
        输入已有用户 ID 直接绑定，或填写信息创建新用户
      </el-alert>
      <el-form :model="adminForm" label-width="100px" size="default">
        <el-form-item label="用户ID">
          <el-input-number v-model="adminForm.userId" :min="1" placeholder="已有用户的ID" style="width:100%" />
        </el-form-item>
        <el-divider>或创建新用户</el-divider>
        <el-form-item label="用户名">
          <el-input v-model="adminForm.username" placeholder="用户名" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="adminForm.email" placeholder="邮箱" />
        </el-form-item>
        <el-form-item label="登录密码">
          <el-input v-model="adminForm.password" type="password" placeholder="不少于6位" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addAdminVisible = false">取消</el-button>
        <el-button type="primary" :loading="addingAdmin" @click="handleAddAdmin">添加</el-button>
      </template>
    </el-dialog>

    <!-- 佣金预览 -->
    <el-dialog v-model="commissionVisible" :title="`佣金预览 — ${currentChannel?.name}`" width="500px">
      <el-form label-width="100px" size="default">
        <el-form-item label="报名价格">
          <el-input-number v-model="previewPrice" :min="0" :precision="2" style="width:100%" @change="fetchPreview" />
        </el-form-item>
        <el-form-item label="渠道代码">
          <el-input v-model="previewChannel" disabled :placeholder="currentChannel?.code" />
        </el-form-item>
      </el-form>
      <div v-if="previewResult" class="commission-preview">
        <div class="preview-row">
          <span>订单金额</span><span>¥{{ previewPrice }}</span>
        </div>
        <div class="preview-row">
          <span>佣金比例</span><span>{{ (previewResult.rate * 100).toFixed(2) }}%</span>
        </div>
        <div class="preview-row highlight">
          <span>预估佣金</span><span class="amount">¥{{ previewResult.amount.toFixed(2) }}</span>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { channelApi, commissionApi } from '../api/client'

const loading = ref(false), list = ref([]), total = ref(0)
const query = reactive({ page: 1, pageSize: 10 })
const filters = reactive({ keyword: '', isEnabled: '' })

const formVisible = ref(false), editingChannel = ref(null)
const formRef = ref(), saving = ref(false)
const form = reactive({ name: '', code: '', rate: 0.10, description: '' })
const rules = {
  name: [{ required: true, message: '请输入渠道名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入渠道代码', trigger: 'blur' }],
  rate: [{ required: true, message: '请输入佣金比例', trigger: 'blur' }],
}

const adminVisible = ref(false), currentChannel = ref(null)
const adminLoading = ref(false), channelAdmins = ref([])
const addAdminVisible = ref(false), addingAdmin = ref(false)
const adminForm = reactive({ userId: null, username: '', email: '', password: '' })

const commissionVisible = ref(false)
const previewPrice = ref(100), previewChannel = ref(''), previewResult = ref(null)

const fetchList = async () => {
  loading.value = true
  try {
    const params = { ...query }
    if (filters.keyword) params.keyword = filters.keyword
    if (filters.isEnabled !== '') params.isEnabled = filters.isEnabled
    const res = await channelApi.list(params)
    list.value = res.data.list
    total.value = res.data.total
  } finally { loading.value = false }
}

const openCreate = () => { editingChannel.value = null; Object.assign(form, { name: '', code: '', rate: 0.10, description: '' }); formVisible.value = true }
const openEdit = (row) => { editingChannel.value = row; Object.assign(form, { name: row.name, rate: row.rate, description: row.description }); formVisible.value = true }

const handleSave = async () => {
  saving.value = true
  try {
    if (editingChannel.value) {
      await channelApi.update(editingChannel.value.id, form)
      ElMessage.success('更新成功')
    } else {
      await channelApi.create(form)
      ElMessage.success('创建成功')
    }
    formVisible.value = false
    fetchList()
  } finally { saving.value = false }
}

const toggleEnabled = async (row) => {
  await channelApi.update(row.id, { isEnabled: !row.isEnabled })
  row.isEnabled = !row.isEnabled
  ElMessage.success(row.isEnabled ? '已启用' : '已停用')
}

const handleDelete = async (row) => {
  await channelApi.delete(row.id)
  ElMessage.success('删除成功')
  fetchList()
}

const openAdmins = async (row) => {
  currentChannel.value = row
  adminVisible.value = true
  adminLoading.value = true
  try {
    const res = await channelApi.detail(row.id)
    channelAdmins.value = res.data.admins || []
  } finally { adminLoading.value = false }
}

const openAddAdmin = () => { Object.assign(adminForm, { userId: null, username: '', email: '', password: '' }); addAdminVisible.value = true }

const handleAddAdmin = async () => {
  addingAdmin.value = true
  try {
    const data = {}
    if (adminForm.userId) data.userId = adminForm.userId
    else { data.username = adminForm.username; data.email = adminForm.email; data.password = adminForm.password }
    await channelApi.addAdmin(currentChannel.value.id, data)
    ElMessage.success('添加成功')
    addAdminVisible.value = false
    openAdmins(currentChannel.value)
  } finally { addingAdmin.value = false }
}

const removeAdmin = async (row) => {
  await channelApi.removeAdmin(currentChannel.value.id, row.user.id)
  ElMessage.success('已移除')
  openAdmins(currentChannel.value)
}

const openCommission = async (row) => {
  currentChannel.value = row
  previewChannel.value = row.code
  previewPrice.value = 100
  commissionVisible.value = true
  await fetchPreview()
}

const fetchPreview = async () => {
  if (!previewPrice.value) return
  const res = await commissionApi.preview(previewPrice.value, previewChannel.value)
  const targeted = res.data.targetedChannel
  previewResult.value = targeted ? { rate: Number(targeted.rate), amount: res.data.targetedAmount } : null
}

onMounted(fetchList)
</script>

<style scoped>
.pagination-wrap { display: flex; justify-content: center; margin-top: 20px; }
.commission-preview {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 16px;
  margin-top: 8px;
}
.preview-row {
  display: flex; justify-content: space-between; padding: 6px 0;
  font-size: 14px; color: #666;
}
.preview-row.highlight { border-top: 1px solid #e8e8e8; margin-top: 4px; padding-top: 12px; font-weight: bold; font-size: 16px; }
.preview-row .amount { color: #f56c6c; font-size: 20px; font-weight: bold; }
</style>
