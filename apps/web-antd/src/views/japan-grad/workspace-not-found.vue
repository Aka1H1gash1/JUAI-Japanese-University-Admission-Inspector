<template>
  <main class="juai-not-found">
    <span>JUAI</span>
    <h1>没有找到这个页面</h1>
    <p>这个链接可能已更新，请从工作区继续查看。</p>
    <RouterLink to="/japan-grad/overview">返回申请总览 →</RouterLink>
  </main>
</template>
<style scoped>
.juai-not-found {
  max-width: 640px;
  padding: 80px 24px;
  margin: auto;
  color: #203252;
}

.juai-not-found > span {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.juai-not-found h1 {
  margin: 28px 0 14px;
  font-size: 30px;
}

.juai-not-found p {
  line-height: 1.8;
  color: #586d87;
}

.juai-not-found a {
  display: inline-block;
  margin-top: 20px;
  color: #526790;
}
</style>
