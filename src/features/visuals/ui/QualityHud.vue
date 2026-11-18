<script setup lang="ts">
import { computed } from "vue";
import type { QualityMonitor } from "../model/quality";
const props = defineProps<{ monitor: QualityMonitor }>();
const label = computed(() => {
  const d = props.monitor.state.detail;
  return d === "high" ? "高细节" : d === "medium" ? "中细节" : "低细节";
});
</script>
<template>
  <div class="quality-hud">
    <div class="quality-line">
      <span class="quality-main"
        >16:9 · {{ monitor.state.width }} × {{ monitor.state.height }} ·
        {{ label }} · {{ monitor.state.fps }} FPS</span
      >
      <span v-if="monitor.state.recording" class="quality-badge rec"
        >REC 独立画布</span
      >
    </div>
    <ul v-if="monitor.state.reasons.length" class="quality-reasons">
      <li v-for="(r, i) in monitor.state.reasons" :key="i">{{ r }}</li>
    </ul>
  </div>
</template>
