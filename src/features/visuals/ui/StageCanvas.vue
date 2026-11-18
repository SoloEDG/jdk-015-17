<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import type { StageDocument, Analysis } from "../../../shared/types";
import { createRenderer, type StageRenderer } from "../model/renderer";
import { createQualityMonitor, type QualityMonitor } from "../model/quality";
const props = defineProps<{ doc: StageDocument; read: () => Analysis }>();
const emit = defineEmits<{
  ready: [HTMLCanvasElement];
  renderer: [StageRenderer];
  monitor: [QualityMonitor];
}>();
const canvas = ref<HTMLCanvasElement>();
let renderer: StageRenderer | undefined;
let monitor: QualityMonitor | undefined;
onMounted(() => {
  const el = canvas.value;
  if (!el) return;
  // 复用 App 中既有的 .stage-shell / .canvas-wrap 结构，不新增包裹层
  const shell = el.closest<HTMLElement>(".stage-shell") ?? el;
  const wrap = el.parentElement ?? el;
  monitor = createQualityMonitor(shell, wrap);
  renderer = createRenderer(el, props.doc, props.read, monitor);
  emit("ready", el);
  emit("monitor", monitor);
  emit("renderer", renderer);
});
onUnmounted(() => {
  renderer?.dispose();
  monitor?.dispose();
});
</script>
<template><canvas ref="canvas" aria-label="音乐可视化舞台" /></template>
