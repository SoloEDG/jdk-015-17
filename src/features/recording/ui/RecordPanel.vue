<script setup lang="ts">
import { computed, ref } from "vue";
import type { StageRecorder } from "../model/recorder";
import type { QualityMonitor } from "../../visuals/model/quality";
import type { StageRenderer } from "../../visuals/model/renderer";
import type { RecordSize } from "../../../shared/types";
import { clock } from "../../../shared/math";
import { RECORD_SIZES, checkFeasibility } from "../lib/feasibility";

const props = defineProps<{
  recorder: StageRecorder;
  monitor: QualityMonitor;
  renderer: StageRenderer;
}>();
const emit = defineEmits<{ start: [RecordSize] }>();

const chosen = ref<RecordSize>(RECORD_SIZES[1]);
const feasibility = computed(() =>
  checkFeasibility(chosen.value, props.monitor.state),
);
const busy = computed(
  () => props.recorder.state.status !== "idle",
);

function requestStart() {
  // 预检在开始之前完成；风险时让用户改选可行尺寸，而不是录到一半被动降级
  const f = checkFeasibility(chosen.value, props.monitor.state);
  if (!f.ok) {
    props.recorder.state.error = f.message;
    return;
  }
  emit("start", chosen.value);
}
function pick(size: RecordSize) {
  chosen.value = size;
}
</script>
<template>
  <section class="panel record-panel">
    <div class="panel-heading">
      <span>05 / CAPTURE SESSION</span
      ><span>{{ chosen.width }} × {{ chosen.height }}</span>
    </div>
    <div class="record-top">
      <div>
        <strong>把现场留住。</strong><small>独立录制画布 · 30 FPS · 尺寸锁定</small>
      </div>
      <span class="record-clock">{{ clock(recorder.state.elapsed) }}</span>
    </div>

    <div class="size-options" role="group" aria-label="录制输出尺寸">
      <button
        v-for="size in RECORD_SIZES"
        :key="size.label"
        class="size-option"
        :class="{ selected: chosen.width === size.width && !busy }"
        :disabled="busy"
        @click="pick(size)"
      >
        <b>{{ size.label }}</b
        ><small>{{ size.width }}×{{ size.height }}</small>
      </button>
    </div>

    <p
      v-if="!busy"
      class="feasibility"
      :class="{ warn: feasibility.risk }"
      role="status"
    >
      {{ feasibility.message }}
    </p>
    <div v-if="!busy && feasibility.risk" class="alternatives">
      <small>可行选择：</small>
      <button
        v-for="size in feasibility.alternatives"
        :key="size.label"
        class="alt-button"
        @click="pick(size)"
      >
        {{ size.label }}
      </button>
    </div>
    <p v-if="busy && recorder.state.size" class="feasibility" role="status">
      正在录制 {{ recorder.state.size.width }} ×
      {{ recorder.state.size.height }}，输出尺寸保持不变
    </p>

    <button
      class="record-button"
      :disabled="recorder.state.status === 'saving'"
      @click="busy ? recorder.stop() : requestStart()"
    >
      <span></span
      >{{
        recorder.state.status === "idle"
          ? "开始录制"
          : recorder.state.status === "saving"
            ? "正在保存…"
            : "停止录制"
      }}
    </button>
    <p v-if="recorder.state.error" role="alert">{{ recorder.state.error }}</p>
    <small class="muted"
      >预览降级不影响录制构图 · 切换场景不中断录制 · 保存于本次会话</small
    >
  </section>
</template>
