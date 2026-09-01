<script setup lang="ts">
import { ref } from "vue";
import { TrButton, TrCard, TrChip, TrField } from "../primitives";

const sample = ref("");
const selected = ref("continue");
</script>

<template>
  <main class="tr-page tr-stack design-system-catalog">
    <header class="tr-stack">
      <p class="tr-caption">Warm Precision v1</p>
      <h1 class="tr-display">恢复现场，也恢复掌控感。</h1>
      <p class="tr-body tr-reading-width">此目录只用于开发和视觉审查，不连接生产路由。</p>
    </header>

    <TrCard class="tr-stack">
      <h2 class="tr-heading">Actions</h2>
      <div class="tr-cluster">
        <TrButton>完成今天这一步</TrButton>
        <TrButton variant="secondary">稍后继续</TrButton>
        <TrButton variant="quiet">返回</TrButton>
        <TrButton :loading="true">正在保存</TrButton>
      </div>
    </TrCard>

    <TrCard class="tr-stack">
      <h2 class="tr-heading">Fields and choices</h2>
      <TrField
        v-model="sample"
        label="你上次做到哪里？"
        placeholder="例如：报名页已经写完第一段"
        help="只写真实进度，不需要整理成汇报。"
      />
      <div class="tr-cluster" aria-label="下一步决定">
        <TrChip :selected="selected === 'continue'" @select="selected = 'continue'">继续</TrChip>
        <TrChip :selected="selected === 'shrink'" @select="selected = 'shrink'">缩小</TrChip>
        <TrChip :selected="selected === 'ask'" @select="selected = 'ask'">求助</TrChip>
      </div>
    </TrCard>

    <TrCard class="tr-stack">
      <h2 class="tr-heading">Status</h2>
      <p class="tr-status tr-status--success">进度已保存在这台设备。</p>
      <p class="tr-status tr-status--info">先确认恢复摘要，再继续。</p>
      <p class="tr-status tr-status--warning">还没有留下下次可继续的位置。</p>
      <p class="tr-status tr-status--danger">保存失败，请保留当前页面并重试。</p>
    </TrCard>
  </main>
</template>
