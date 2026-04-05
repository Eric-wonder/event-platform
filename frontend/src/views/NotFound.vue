<template>
  <div style="display:flex;align-items:center;justify-content:center;min-height:60vh;flex-direction:column">
    <h1 style="font-size:120px;color:#ddd;margin:0">404</h1>
    <p style="color:#888;font-size:18px;margin:16px 0">页面不存在</p>
    <el-button type="primary" @click="$router.push('/')">返回首页</el-button>
  </div>
</template>
