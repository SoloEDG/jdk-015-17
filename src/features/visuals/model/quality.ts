import { reactive } from "vue";
import type { DetailLevel, QualityState } from "../../../shared/types";

const MAX_DPR = 2;
const MIN_SIDE = 280;
// 各细节档位允许的最大边（物理像素），录制中进一步压缩以保护录制帧率
const CAPS: Record<DetailLevel, { preview: number; recording: number }> = {
  high: { preview: 2560, recording: 1600 },
  medium: { preview: 1600, recording: 1280 },
  low: { preview: 960, recording: 960 },
};
const DETAIL_ORDER: DetailLevel[] = ["high", "medium", "low"];

function roundEven(n: number) {
  return Math.max(2, Math.round(n / 2) * 2);
}

/**
 * 预览质量监视器：
 * - 依据容器 CSS 尺寸、设备像素比、全屏状态选择画布物理分辨率
 * - 依据实时帧率在三档细节间迟滞切换（减少粒子/线条，不触碰节拍与运动）
 * - 所有变化只改画布尺寸与细节档，不重置渲染器内部状态
 */
export function createQualityMonitor(shell: HTMLElement, canvasWrap: HTMLElement) {
  const state = reactive<QualityState>({
    width: 1280,
    height: 720,
    cssWidth: 0,
    cssHeight: 0,
    dpr: 1,
    fps: 60,
    detail: "high",
    fullscreen: false,
    recording: false,
    reasons: [],
  });

  let frameCount = 0;
  let fpsWindowStart = performance.now();
  let emaFps = 60;
  let lowSince = 0;
  let recoverSince = 0;

  function isFullscreen() {
    return document.fullscreenElement === shell;
  }

  function computeSize() {
    const rect = canvasWrap.getBoundingClientRect();
    state.cssWidth = Math.max(0, rect.width);
    state.cssHeight = Math.max(0, rect.height);
    state.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    state.fullscreen = isFullscreen();

    if (rect.width < 4) return;

    // 容器固定 16:9（aspect-ratio），按容器宽度取 16:9 物理尺寸
    const cap = CAPS[state.detail][state.recording ? "recording" : "preview"];
    const target = Math.min(rect.width * state.dpr, cap);
    const width = roundEven(Math.max(MIN_SIDE, Math.min(cap, target)));
    const height = roundEven((width * 9) / 16);

    if (width !== state.width || height !== state.height) {
      state.width = width;
      state.height = height;
    }
    updateReasons();
  }

  function updateReasons() {
    const reasons: string[] = [];
    const nativeDpr = window.devicePixelRatio || 1;
    if (nativeDpr > MAX_DPR + 0.01)
      reasons.push(`像素密度已限制为 ${MAX_DPR}x（设备 ${nativeDpr.toFixed(1)}x）`);
    // 实时重算，避免尺寸/档位变化后旧标记残留
    const cap = CAPS[state.detail][state.recording ? "recording" : "preview"];
    const cappedByBudget = state.cssWidth * state.dpr > cap + 0.5;
    if (state.recording) {
      reasons.push("录制中：优先保证输出帧率，预览已降载");
      if (cappedByBudget)
        reasons.push("性能预算受限，预览分辨率低于屏幕原生像素");
    } else if (state.detail !== "high") {
      reasons.push(
        state.detail === "low"
          ? "实时帧率偏低：已减少粒子与线条细节"
          : "实时帧率波动：已降低部分画面细节",
      );
      if (cappedByBudget)
        reasons.push("性能预算受限，预览分辨率低于屏幕原生像素");
    } else if (cappedByBudget) {
      reasons.push("已达到单帧渲染像素上限");
    }
    if (state.fullscreen) reasons.push("全屏模式：按屏幕密度适配");
    state.reasons = reasons;
  }

  const resizeObserver = new ResizeObserver(() => computeSize());
  resizeObserver.observe(canvasWrap);
  const onFullscreen = () => computeSize();
  document.addEventListener("fullscreenchange", onFullscreen);
  // 浏览器缩放会改变 devicePixelRatio；window resize 与 ResizeObserver 都会触发，
  // 这里再兜底一次，确保 DPR 变化（包括连续变化）都能重新选档
  const onWindowResize = () => computeSize();
  window.addEventListener("resize", onWindowResize);

  computeSize();

  return {
    state,
    /** 每帧由渲染循环调用，返回当前平滑帧率 */
    tick(now: number) {
      frameCount++;
      const elapsed = now - fpsWindowStart;
      if (elapsed >= 500) {
        const instant = (frameCount * 1000) / elapsed;
        emaFps = emaFps * 0.5 + instant * 0.5;
        state.fps = Math.round(emaFps);
        frameCount = 0;
        fpsWindowStart = now;
        adaptDetail(now);
      }
      return emaFps;
    },
    setRecording(active: boolean) {
      state.recording = active;
      lowSince = 0;
      recoverSince = 0;
      computeSize();
    },
    /** 录制开始时允许外部（预检）预先压低预览档位 */
    clampPreviewForRecording() {
      if (state.detail === "low" || emaFps < 45) {
        state.detail = emaFps < 32 ? "low" : "medium";
      }
      computeSize();
    },
    dispose() {
      resizeObserver.disconnect();
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("resize", onWindowResize);
    },
  };

  function adaptDetail(now: number) {
    // 录制中阈值更严格，宁可牺牲预览细节也要保住录制帧
    const downAt = state.recording ? 47 : 40;
    const upAt = state.recording ? 56 : 52;
    const idx = DETAIL_ORDER.indexOf(state.detail);

    if (emaFps < downAt && idx < DETAIL_ORDER.length - 1) {
      if (!lowSince) lowSince = now;
      recoverSince = 0;
      // 持续约 1s 低帧率才降档，避免瞬时抖动
      if (now - lowSince > 1000) {
        state.detail = DETAIL_ORDER[idx + 1];
        lowSince = 0;
        computeSize();
      }
    } else if (emaFps > upAt && idx > 0) {
      if (!recoverSince) recoverSince = now;
      lowSince = 0;
      // 恢复需要持续更久（4s）且期间没有再掉帧，防止档位来回震荡
      if (now - recoverSince > 4000) {
        state.detail = DETAIL_ORDER[idx - 1];
        recoverSince = 0;
        computeSize();
      }
    } else {
      lowSince = 0;
      recoverSince = 0;
    }
    updateReasons();
  }
}

export type QualityMonitor = ReturnType<typeof createQualityMonitor>;
