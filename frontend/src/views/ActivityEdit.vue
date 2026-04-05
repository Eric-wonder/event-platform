<template>
  <!-- 编辑页复用创建页逻辑，通过 route.params.id 区分 -->
  <activity-create-stub />
</template>

<script setup>
// 编辑页复用 ActivityCreate，通过路由 :id 参数控制
import ActivityCreate from './ActivityCreate.vue'
</script>
