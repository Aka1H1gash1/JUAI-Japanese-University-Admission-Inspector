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
  padding: 68px 20px;
  margin: auto;
  color: #203252;
}

.juai-not-found > span {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.juai-not-found h1 {
  margin: 24px 0 12px;
  font-size: 26px;
}

.juai-not-found p {
  line-height: 1.8;
  color: #586d87;
}

.juai-not-found a {
  display: inline-block;
  margin-top: 17px;
  color: #526790;
}
</style>
