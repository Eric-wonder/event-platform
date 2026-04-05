<template>
  <el-card>
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>用户管理</h3>
        <div style="display:flex;gap:8px">
          <el-tag type="info">总计：{{ stats.total }} 人</el-tag>
          <el-tag type="danger">已封禁：{{ stats.bannedCount }} 人</el-tag>
        </div>
      </div>
    </template>

    <!-- 筛选 -->
    <el-row :gutter="12" style="margin-bottom:16px" align="middle">
      <el-col :span="5">
        <el-input v-model="filters.keyword" placeholder="用户名/邮箱" clearable @change="resetAndFetch" />
      </el-col>
      <el-col :span="4">
        <el-select v-model="filters.role" placeholder="角色" clearable @change="resetAndFetch">
          <el-option label="普通用户" value="USER" />
          <el-option label="组织者" value="ORGANIZER" />
          <el-option label="管理员" value="ADMIN" />
          <el-option label="渠道管理员" value="CHANNEL_MANAGER" />
        </el-select>
      </el-col>
      <el-col :span="3">
        <el-select v-model="filters.isBanned" placeholder="状态" clearable @change="resetAndFetch">
          <el-option label="正常" :value="false" />
          <el-option label="已封禁" :value="true" />
        </el-select>
      </el-col>
      <el-col :span="4">
        <el-button @click="filters = { keyword:'', role:'', isBanned:'' }; resetAndFetch()">重置</el-button>
      </el-col>
    </el-row>

    <!-- 表格 -->
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column label="用户" min-width="180">
        <template #default="{ row }">
          <div style="display:flex;align-items:center;gap:8px">
            <el-avatar :size="32">{{ row.username?.[0]?.toUpperCase() }}</el-avatar>
            <div>
              <div style="font-weight:500">{{ row.username }}</div>
              <div style="font-size:12px;color:#888">{{ row.email }}</div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="角色" width="130">
        <template #default="{ row }">
          <el-tag :type="roleTagMap[row.role]">{{ roleLabel(row.role) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.isBanned ? 'danger' : 'success'" size="small">
            {{ row.isBanned ? '已封禁' : '正常' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="报名数" width="100">
        <template #default="{ row }">
          {{ (row._count?.registrations || 0) + (row._count?.projectRegistrations || 0) }}
        </template>
      </el-table-column>
      <el-table-column label="注册时间" width="160">
        <template #default="{ row }">{{ formatDT(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" size="small" text @click="openDetail(row)">详情</el-button>
          <el-select
            v-if="row.role !== 'ADMIN'" size="small" :model-value="row.role"
            style="width:110px" @change="v => changeRole(row, v)"
          >
            <el-option label="普通用户" value="USER" />
            <el-option label="组织者" value="ORGANIZER" />
            <el-option label="管理员" value="ADMIN" />
            <el-option label="渠道管理员" value="CHANNEL_MANAGER" />
          </el-select>
          <el-button
            v-if="row.role !== 'ADMIN'" size="small" text
            :type="row.isBanned ? 'success' : 'danger'"
            @click="toggleBan(row)"
          >
            {{ row.isBanned ? '解封' : '封禁' }}
          </el-button>
          <el-button size="small" text type="warning" @click="openReset(row)">重置密码</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-wrap" v-if="total > 0">
      <el-pagination background layout="total,prev,pager,next"
        :total="total" :page-size="query.pageSize" :current-page="query.page"
        @current-change="p => { query.page = p; fetch() }"
      />
    </div>
  </el-card>

  <!-- 用户详情 -->
  <el-dialog v-model="detailVisible" title="用户详情" width="520px">
    <el-descriptions v-if="currentRow" :column="2" border>
      <el-descriptions-item label="ID">{{ currentRow.id }}</el-descriptions-item>
      <el-descriptions-item label="用户名">{{ currentRow.username }}</el-descriptions-item>
      <el-descriptions-item label="邮箱">{{ currentRow.email }}</el-descriptions-item>
      <el-descriptions-item label="手机">{{ currentRow.phone || '-' }}</el-descriptions-item>
      <el-descriptions-item label="角色">
        <el-tag :type="roleTagMap[currentRow.role]">{{ roleLabel(currentRow.role) }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="状态">
        <el-tag :type="currentRow.isBanned ? 'danger' : 'success'">
          {{ currentRow.isBanned ? '已封禁' : '正常' }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="注册时间">{{ formatDT(currentRow.createdAt) }}</el-descriptions-item>
      <el-descriptions-item label="关联渠道" v-if="currentRow.channelAdmin">
        {{ currentRow.channelAdmin.channel?.name }} ({{ currentRow.channelAdmin.channel?.code }})
      </el-descriptions-item>
      <el-descriptions-item label="赛事报名">{{ currentRow._count?.registrations || 0 }} 次</el-descriptions-item>
      <el-descriptions-item label="项目报名">{{ currentRow._count?.projectRegistrations || 0 }} 次</el-descriptions-item>
    </el-descriptions>
    <template #footer>
      <el-button @click="detailVisible = false">关闭</el-button>
      <el-button type="danger" v-if="currentRow.role !== 'ADMIN' && !currentRow.isBanned"
        @click="toggleBan(currentRow); detailVisible = false">封禁该用户</el-button>
      <el-button type="warning" v-if="currentRow.role !== 'ADMIN'"
        @click="detailVisible=false; openReset(currentRow)">重置密码</el-button>
    </template>
  </el-dialog>

  <!-- 重置密码 -->
  <el-dialog v-model="resetVisible" title="重置用户密码" width="400px">
    <el-alert type="warning" :closable="false" style="margin-bottom:16px">
      将重置「{{ resetTarget?.username }}」的登录密码，请设置一个新密码并告知用户。
    </el-alert>
    <el-form-item label="新密码" required>
      <el-input v-model="newPassword" type="password" show-password placeholder="至少8位" style="width:100%" />
    </el-form-item>
    <template #footer>
      <el-button @click="resetVisible = false">取消</el-button>
      <el-button type="primary" :loading="resetting" @click="handleReset">确认重置</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '../api/client'

const loading = ref(false), list = ref([]), total = ref(0)
const query = reactive({ page: 1, pageSize: 20 })
const filters = reactive({ keyword: '', role: '', isBanned: '' })
const stats = reactive({ total: 0, bannedCount: 0 })

const detailVisible = ref(false), currentRow = ref(null)
const resetVisible = ref(false), resetTarget = ref(null), resetting = ref(false)
const newPassword = ref('')

const roleTagMap = { USER: '', ORGANIZER: 'success', ADMIN: 'danger', CHANNEL_MANAGER: 'warning' }
const roleLabel = r => ({ USER: '普通用户', ORGANIZER: '组织者', ADMIN: '管理员', CHANNEL_MANAGER: '渠道管理员' }[r] || r)
const formatDT = d => d ? new Date(d).toLocaleString('zh-CN') : ''

const resetAndFetch = () => { query.page = 1; fetch() }

const fetch = async () => {
  loading.value = true
  try {
    const params = { ...query }
    if (filters.keyword) params.keyword = filters.keyword
    if (filters.role) params.role = filters.role
    if (filters.isBanned !== '') params.isBanned = filters.isBanned
    const [userRes, statsRes] = await Promise.all([
      adminApi.users(params),
      adminApi.stats(),
    ])
    list.value = userRes.data.list
    total.value = userRes.data.total
    Object.assign(stats, statsRes.data)
  } finally { loading.value = false }
}

const openDetail = (row) => { currentRow.value = row; detailVisible.value = true }

const changeRole = async (row, role) => {
  try {
    await ElMessageBox.confirm(
      `确定将「${row.username}」的角色从「${roleLabel(row.role)}」变更为「${roleLabel(role)}」？`,
      '变更角色', { type: 'warning' }
    )
    await adminApi.updateRole(row.id, role)
    ElMessage.success(`角色已更新为「${roleLabel(role)}」`)
    row.role = role
  } catch {}
}

const toggleBan = async (row) => {
  try {
    if (row.isBanned) {
      await adminApi.unban(row.id)
      ElMessage.success(`「${row.username}」已解除封禁`)
    } else {
      await ElMessageBox.confirm(`确定封禁「${row.username}」？该用户将无法登录。`, '封禁用户', { type: 'warning' })
      await adminApi.ban(row.id)
      ElMessage.warning(`「${row.username}」已被封禁`)
    }
    row.isBanned = !row.isBanned
    if (currentRow.value?.id === row.id) currentRow.value.isBanned = row.isBanned
  } catch {}
}

const openReset = (row) => { resetTarget.value = row; newPassword.value = ''; resetVisible.value = true }

const handleReset = async () => {
  if (!newPassword.value || newPassword.value.length < 8) {
    ElMessage.error('密码至少8位'); return
  }
  resetting.value = true
  try {
    await adminApi.resetPassword(resetTarget.value.id, newPassword.value)
    ElMessage.success('密码已重置')
    resetVisible.value = false
  } finally { resetting.value = false }
}

onMounted(fetch)
</script>

<style scoped>
.pagination-wrap { display: flex; justify-content: center; margin-top: 16px; }
</style>
