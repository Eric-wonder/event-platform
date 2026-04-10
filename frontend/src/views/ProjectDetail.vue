<template>
  <div class="project-detail" v-if="project">
    <!-- 封面 -->
    <div v-if="project.coverImage" class="cover-wrap">
      <img :src="project.coverImage" :alt="project.title" class="cover-img" />
    </div>

    <el-row :gutter="20">
      <!-- 主内容 -->
      <el-col :xs="24" :sm="24" :md="18">
        <el-card>
          <template #header>
            <div class="card-header">
              <h2>{{ project.title }}</h2>
              <div class="meta-tags">
                <el-tag v-if="project.price > 0" type="danger" size="large">
                  💰 ¥{{ project.price }}
                </el-tag>
                <el-tag v-else type="success" size="large">免费</el-tag>
                <el-tag :type="project.isEnabled ? 'success' : 'info'">
                  {{ project.isEnabled ? '报名中' : '已截止' }}
                </el-tag>
                <el-tag v-if="project.deadline" type="warning">
                  ⏰ {{ formatDT(project.deadline) }} 截止
                </el-tag>
                <el-tag type="info">已报名 {{ project.registrationCount }} 人</el-tag>
              </div>
            </div>
          </template>

          <!-- 项目详情（富文本） -->
          <div class="rich-content" v-html="project.content"></div>
        </el-card>
      </el-col>

      <!-- 侧边栏 -->
      <el-col :xs="24" :sm="24" :md="6">
        <!-- 报名卡片 -->
        <el-card class="reg-sidebar" style="margin-top: 16px;">
          <div class="price-tag" v-if="project.price > 0">
            <span class="price-num">¥{{ project.price }}</span>
            <span class="price-unit">元</span>
          </div>
          <div class="price-tag" v-else>
            <span class="price-free">免费报名</span>
          </div>

          <template v-if="project.isEnabled && (!project.deadline || new Date(project.deadline) > new Date())">
            <el-button
              type="primary"
              size="large"
              style="width:100%;margin-bottom:12px"
              @click="goToRegister"
            >
              {{ isLoggedIn ? '立即报名' : '登录后报名' }}
            </el-button>
            <el-button
              v-if="!isLoggedIn"
              type="default"
              size="large"
              style="width:100%"
              @click="$router.push('/login')"
            >
              去登录
            </el-button>
          </template>
          <el-alert v-else type="warning" :closable="false"
            :title="!project.isEnabled ? '该项目已停止报名' : '报名已截止'"
          />

          <el-divider />
          <div class="sidebar-info">
            <div class="info-item">
              <span class="info-label">创建时间</span>
              <span>{{ formatDT(project.createdAt) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">报名人数</span>
              <span>{{ project.registrationCount }} 人</span>
            </div>
            <div v-if="project.deadline" class="info-item">
              <span class="info-label">截止时间</span>
              <span>{{ formatDT(project.deadline) }}</span>
            </div>
          </div>
        </el-card>

        <!-- 提示卡片 -->
        <el-card style="margin-top:16px" v-if="project.fields?.length > 0">
          <template #header><h4>报名所需材料</h4></template>
          <div class="field-hint">
            <div v-for="f in project.fields" :key="f.id" class="hint-item">
              <span class="hint-type">{{ typeLabelMap[f.fieldType] }}</span>
              <span>{{ f.label }}</span>
              <span v-if="f.required" style="color:#f56c6c">*</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>

  <el-skeleton v-else :rows="8" animated />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { projectApi } from '../api/client'
import { useUserStore } from '../stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const project = ref(null)
const isLoggedIn = computed(() => !!userStore.token)

const typeLabelMap = {
  TEXT: '文本', TEXTAREA: '多行', SELECT: '下拉', RADIO: '单选',
  CHECKBOX: '多选', DATE: '日期', FILE: '文件',
}

const formatDT = d => d ? new Date(d).toLocaleString('zh-CN') : ''

const goToRegister = () => {
  router.push(`/projects/${route.params.id}/register`)
}

onMounted(async () => {
  const res = await projectApi.detail(route.params.id)
  project.value = res.data
})
</script>

<style scoped>
.cover-wrap { margin-bottom: 16px; }
.cover-img { width: 100%; max-height: 400px; object-fit: cover; border-radius: 12px; display: block; }
.card-header h2 { margin: 0 0 8px; }
.meta-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.rich-content { font-size: 15px; line-height: 1.8; color: #333; }
.rich-content :deep(img) { max-width: 100%; border-radius: 8px; margin: 8px 0; }
.rich-content :deep(table) { width: 100%; border-collapse: collapse; }
.rich-content :deep(td), .rich-content :deep(th) { border: 1px solid #ddd; padding: 8px; }
.reg-sidebar { text-align: center; }
.price-tag { margin-bottom: 16px; }
.price-num { font-size: 36px; font-weight: bold; color: #f56c6c; }
.price-unit { font-size: 14px; color: #f56c6c; margin-left: 4px; }
.price-free { font-size: 28px; font-weight: bold; color: #67c23a; }
.sidebar-info { display: flex; flex-direction: column; gap: 8px; }
.info-item { display: flex; justify-content: space-between; font-size: 13px; }
.info-label { color: #888; }
.field-hint { display: flex; flex-direction: column; gap: 6px; }
.hint-item { font-size: 13px; display: flex; gap: 6px; align-items: center; }
.hint-type { font-size: 11px; background: #f0f0f0; padding: 1px 5px; border-radius: 3px; color: #666; }
</style>
