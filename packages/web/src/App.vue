<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { ReviewRecord } from './types'
import ReviewShell from './components/ReviewShell.vue'

const record = ref<ReviewRecord | null>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const res = await fetch('/api/review')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    record.value = (await res.json()) as ReviewRecord
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})
</script>

<template>
  <ReviewShell v-if="record" :record="record" />
  <div v-else class="app-state">
    <p v-if="error" class="app-error">{{ $t('app.loadError') }} ({{ error }})</p>
    <p v-else class="nolyra-muted">{{ $t('app.loading') }}</p>
  </div>
</template>

<style scoped>
.app-state {
  min-height: 60vh;
  display: grid;
  place-items: center;
  font-size: 14px;
}

.app-error {
  color: var(--nolyra-risk-high);
}
</style>
