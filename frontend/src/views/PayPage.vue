<template>
  <div class="pay-page">
    <!-- 模拟模式提示 -->
    <el-alert v-if="payInfo.mock" type="warning" :closable="false" style="margin-bottom:20px">
      <template #title>
        🧪 <b>沙箱 / 模拟模式</b>
      </template>
      当前未配置微信商户号（WX_MCHID / WX_APIV3_KEY），系统使用模拟数据。
      沙箱模式下可完整体验支付流程，正式上线请配置真实商户号。
    </el-alert>

    <!-- 加载状态 -->
    <div v-if="loading" class="pay-loading">
      <el-icon class="is-loading" style="font-size:40px;color:#07C160"><Loading /></el-icon>
      <p>正在生成支付二维码...</p>
    </div>

    <!-- 支付面板 -->
    <div v-else-if="payInfo.outTradeNo" class="pay-panel">

      <!-- 左侧：订单信息 -->
      <div class="order-info">
        <div class="order-header">
          <div class="order-icon">💰</div>
          <div>
            <div class="order-title">{{ projectTitle }}</div>
            <div class="order-sub">报名费支付</div>
          </div>
        </div>

        <div class="order-amount">
          <span class="amount-label">支付金额</span>
          <span class="amount-value">¥{{ payInfo.amount?.toFixed(2) }}</span>
        </div>

        <el-divider />

        <div class="order-details">
          <div class="detail-row">
            <span class="detail-label">订单号</span>
            <span class="detail-value mono">{{ payInfo.outTradeNo }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">支付方式</span>
            <span class="detail-value">微信支付</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">有效期至</span>
            <span class="detail-value">{{ formatDT(payInfo.expireAt) }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">剩余时间</span>
            <span class="detail-value countdown" :class="{ danger: timeLeft <= 300 }">
              {{ countdownStr }}
            </span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="order-actions">
          <el-button v-if="payStatus === 'PENDING'" type="danger" plain @click="handleCancel">
            取消支付
          </el-button>
          <el-button type="primary" @click="$router.back()">
            返回报名页
          </el-button>
        </div>
      </div>

      <!-- 右侧：二维码 -->
      <div class="qr-section">
        <!-- 支付状态指示器 -->
        <div class="pay-status-badge" :class="statusClass">
          <el-icon v-if="payStatus === 'SUCCESS'" style="color:#67c23a"><CircleCheck /></el-icon>
          <el-icon v-else-if="payStatus === 'FAILED' || payStatus === 'CLOSED'" style="color:#f56c6c"><CircleClose /></el-icon>
          <el-icon v-else class="is-loading" style="color:#909399"><Loading /></el-icon>
          {{ statusLabel }}
        </div>

        <!-- 二维码区域 -->
        <div v-if="payStatus === 'PENDING'" class="qr-wrapper">
          <div v-if="payInfo.qrImage" class="qr-frame">
            <img :src="payInfo.qrImage" alt="支付二维码" class="qr-image" />
          </div>
          <div v-else class="qr-loading-placeholder">
            <el-icon class="is-loading" style="font-size:48px;color:#07C160"><Loading /></el-icon>
            <p>加载中...</p>
          </div>
          <div class="qr-tip">
            <p>📱 请使用微信扫描二维码完成支付</p>
            <p class="mock-tip" v-if="payInfo.mock">
              （模拟模式下点击下方"模拟支付完成"按钮）
            </p>
          </div>
        </div>

        <!-- 成功状态 -->
        <div v-else-if="payStatus === 'SUCCESS'" class="pay-success">
          <div class="success-icon">✅</div>
          <h2 style="color:#67c23a;margin:12px 0">支付成功！</h2>
          <p>您的报名已确认，请等待审核通知。</p>
          <el-button type="primary" style="margin-top:20px" @click="$router.push('/my-registrations')">
            查看我的报名
          </el-button>
        </div>

        <!-- 失败/关闭状态 -->
        <div v-else class="pay-failed">
          <div class="fail-icon">❌</div>
          <h2 style="color:#f56c6c;margin:12px 0">{{ payStatus === 'CLOSED' ? '订单已关闭' : '支付失败' }}</h2>
          <p>{{ payStatus === 'CLOSED' ? '支付超时，订单已自动关闭。' : '请稍后重试。' }}</p>
          <el-button type="primary" style="margin-top:20px" @click="refreshOrder">
            重新发起支付
          </el-button>
        </div>

        <!-- 模拟支付完成（仅 mock 模式可见）-->
        <el-button
          v-if="payInfo.mock && payStatus === 'PENDING'"
          type="success" plain style="margin-top:16px;width:100%"
          @click="mockPaySuccess"
        >
          🧪 模拟支付完成（测试用）
        </el-button>
      </div>
    </div>

    <!-- 加载失败 -->
    <div v-else class="pay-error">
      <el-result icon="error" title="加载失败" sub-title="请返回报名页重新发起支付">
        <template #extra>
          <el-button type="primary" @click="$router.back()">返回</el-button>
        </template>
      </el-result>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Loading, CircleCheck, CircleClose } from '@element-plus/icons-vue'
import { payApi, projectApi } from '../api/client'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const payInfo = ref({})
const payStatus = ref('PENDING')
const projectTitle = ref('')
const countdownStr = ref('')
const timeLeft = ref(1800) // 秒

let timer = null
let countdownTimer = null

const statusClass = computed(() => ({
  pending:   payStatus.value === 'PENDING',
  success:   payStatus.value === 'SUCCESS',
  failed:    ['FAILED', 'CLOSED'].includes(payStatus.value),
}))

const statusLabel = computed(() => ({
  PENDING:  '等待支付',
  SUCCESS:  '✅ 支付成功',
  CLOSED:  '❌ 订单已关闭',
  FAILED:  '❌ 支付失败',
  REFUNDED: '🔙 已退款',
}[payStatus.value] || '等待支付'))

const formatDT = d => d ? new Date(d).toLocaleString('zh-CN') : '-'

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer)
  const expireAt = new Date(payInfo.value.expireAt)
  const tick = () => {
    const left = Math.max(0, Math.floor((expireAt - Date.now()) / 1000))
    timeLeft.value = left
    const m = Math.floor(left / 60), s = left % 60
    countdownStr.value = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    if (left <= 0) {
      clearInterval(countdownTimer)
      payStatus.value = 'CLOSED'
      ElMessage.warning('支付超时，订单已关闭')
    }
  }
  tick()
  countdownTimer = setInterval(tick, 1000)
}

function startPolling(outTradeNo) {
  if (timer) clearInterval(timer)
  let attempts = 0
  const maxAttempts = 60 // 最多轮询 3 分钟

  timer = setInterval(async () => {
    attempts++
    if (attempts > maxAttempts) {
      clearInterval(timer)
      payStatus.value = 'CLOSED'
      return
    }
    try {
      const res = await payApi.status(outTradeNo)
      const status = res.data?.localStatus || res.data?.status
      if (status === 'SUCCESS') {
        clearInterval(timer)
        payStatus.value = 'SUCCESS'
        ElMessage.success('🎉 支付成功！')
        await notifySuccess()
      } else if (status === 'CLOSED' || status === 'FAILED') {
        clearInterval(timer)
        payStatus.value = status
      }
      // PENDING 继续轮询
    } catch (err) {
      // 忽略轮询错误，继续尝试
    }
  }, 3000) // 每 3 秒轮询一次
}

async function notifySuccess() {
  // 支付成功后，通知后端确认（已经在回调中处理，这里做前端友好跳转）
  setTimeout(() => { router.push('/my-registrations') }, 3000)
}

const handleCancel = async () => {
  try {
    await payApi.close(payInfo.value.outTradeNo)
    clearInterval(timer)
    clearInterval(countdownTimer)
    payStatus.value = 'CLOSED'
    ElMessage.warning('订单已关闭')
  } catch (err) {
    ElMessage.error('关闭失败：' + (err.message || '未知错误'))
  }
}

const refreshOrder = () => {
  payInfo.value = {}
  payStatus.value = 'PENDING'
  initPay()
}

const mockPaySuccess = () => {
  // 沙箱模式下，直接将本地订单标记为成功（用于测试）
  payStatus.value = 'SUCCESS'
  ElMessage.success('🧪 模拟支付完成！')
  notifySuccess()
}

const initPay = async () => {
  loading.value = true
  try {
    const projectId = Number(route.query.projectId)
    const registrationId = Number(route.query.registrationId)

    // 获取项目名称
    if (projectId) {
      try {
        const proj = await projectApi.detail(projectId)
        projectTitle.value = proj.data?.title || '报名费'
      } catch {}
    }

    if (!registrationId) {
      ElMessage.error('缺少 registrationId 参数'); return
    }

    // 调用支付接口
    const res = await payApi.createNative({
      registrationId,
      title: projectTitle.value || '报名费',
      amount: Number(route.query.amount) || 0,
    })

    payInfo.value = res.data || {}
    payStatus.value = 'PENDING'
    startCountdown()

    if (res.data?.outTradeNo) {
      startPolling(res.data.outTradeNo)
    }
  } catch (err) {
    ElMessage.error('创建支付订单失败：' + (err.response?.data?.message || err.message))
  } finally {
    loading.value = false
  }
}

onMounted(initPay)
onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<style scoped>
.pay-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
}
.pay-loading {
  text-align: center;
  padding: 80px 0;
  color: #888;
}
.pay-loading p { margin-top: 16px; font-size: 16px; }

.pay-panel {
  display: flex;
  gap: 32px;
  align-items: flex-start;
}

.order-info {
  flex: 1;
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}
.order-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}
.order-icon { font-size: 36px; }
.order-title { font-size: 18px; font-weight: 600; color: #333; }
.order-sub { font-size: 13px; color: #888; margin-top: 2px; }

.order-amount {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
  margin-bottom: 16px;
}
.amount-label { font-size: 14px; color: #666; }
.amount-value { font-size: 28px; font-weight: bold; color: #f56c6c; }

.order-details { margin: 8px 0; }
.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 14px;
}
.detail-label { color: #888; }
.detail-value { color: #333; }
.detail-value.mono { font-family: monospace; font-size: 12px; color: #666; }
.detail-value.countdown {
  font-family: monospace;
  font-size: 16px;
  font-weight: bold;
  color: #07C160;
}
.detail-value.countdown.danger { color: #f56c6c; }

.order-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.qr-section {
  flex: 0 0 320px;
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  text-align: center;
}

.pay-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 14px;
  margin-bottom: 16px;
}
.pay-status-badge.pending { background: #f0f9eb; color: #67c23a; }
.pay-status-badge.success { background: #e8f8f0; color: #67c23a; font-weight: bold; }
.pay-status-badge.failed  { background: #fef0f0; color: #f56c6c; font-weight: bold; }

.qr-wrapper {}
.qr-frame {
  padding: 16px;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 8px;
  display: inline-block;
}
.qr-image { display: block; width: 200px; height: 200px; }
.qr-loading-placeholder { padding: 40px; color: #aaa; }
.qr-tip {
  margin-top: 12px;
  font-size: 13px;
  color: #666;
}
.qr-tip p { margin: 4px 0; }
.mock-tip { color: #e6a23c; font-size: 12px; }

.pay-success, .pay-failed { padding: 20px 0; }
.success-icon, .fail-icon { font-size: 64px; }
.pay-error { padding: 40px; }

.pay-page :deep(.el-divider) { margin: 16px 0; }

@media (max-width: 768px) {
  .pay-panel { flex-direction: column; }
  .qr-section { flex: none; width: 100%; }
}
</style>
