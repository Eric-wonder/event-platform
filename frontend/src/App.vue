<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import { useUserStore } from './stores/user'

const userStore = useUserStore()

onMounted(() => {
  userStore.restoreToken()
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  background-color: #f5f7fa;
}

#app {
  min-height: 100vh;
}

/* 全局移动端适配 */
.el-table {
  max-width: 100%;
}
.el-card {
  max-width: 100%;
  box-sizing: border-box;
}
@media (max-width: 768px) {
  .el-form--label-top .el-form-item__label {
    padding-bottom: 2px;
  }
  .el-dialog {
    width: calc(100vw - 32px) !important;
    margin: 16px auto !important;
  }
}
</style>
