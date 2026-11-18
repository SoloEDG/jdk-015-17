import type {
  Analysis,
  DetailLevel,
  RecordSize,
  Scene,
  StageDocument,
} from "../../../shared/types";
import { getTheme } from "./themes";
import { drawScene } from "../lib/geometry";
import type { QualityMonitor } from "./quality";

interface RecordSession {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  scratch: HTMLCanvasElement;
  scratchCtx: CanvasRenderingContext2D;
  size: RecordSize;
}

/**
 * 单一渲染循环：
 * - 预览画布尺寸/细节由 quality monitor 驱动，变化时只换 backing store，
 *   phase、场景过渡等状态全部保留，并把上一帧拉伸贴回，避免清空/闪烁
 * - 录制期间额外向一块脱离 DOM 的固定尺寸画布绘制（始终高细节），
 *   与预览共用同一 phase 与同一帧分析数据：节拍次数、运动速度、构图完全一致
 * - 录制结束即销毁录制目标，不新增循环、不重复采样
 */
export function createRenderer(
  canvas: HTMLCanvasElement,
  doc: StageDocument,
  read: () => Analysis,
  monitor: QualityMonitor,
) {
  const c = canvas.getContext("2d")!;
  const snapshot = document.createElement("canvas");
  const snapCtx = snapshot.getContext("2d")!;
  const scratch = document.createElement("canvas");
  const scratchCtx = scratch.getContext("2d")!;

  // 持续状态：尺寸调整、全屏切换、场景过渡中都不重置
  let raf = 0,
    last = 0,
    phase = 0,
    current = "",
    previous: Scene | undefined,
    changed = 0;
  let record: RecordSession | undefined;

  canvas.width = monitor.state.width;
  canvas.height = monitor.state.height;
  scratch.width = canvas.width;
  scratch.height = canvas.height;

  function syncPreviewSize() {
    const { width, height } = monitor.state;
    if (canvas.width === width && canvas.height === height) return;
    // 先备份当前帧，resize 后立即贴回，窗口连续变化时画面不中断
    if (canvas.width > 2 && canvas.height > 2) {
      snapshot.width = canvas.width;
      snapshot.height = canvas.height;
      snapCtx.drawImage(canvas, 0, 0);
    }
    canvas.width = width;
    canvas.height = height;
    if (scratch.width !== width || scratch.height !== height) {
      scratch.width = width;
      scratch.height = height;
    }
    c.imageSmoothingEnabled = true;
    if (snapshot.width > 2) c.drawImage(snapshot, 0, 0, width, height);
  }

  function drawFrame(
    ctx: CanvasRenderingContext2D,
    sc: CanvasRenderingContext2D,
    w: number,
    h: number,
    detail: DetailLevel,
    scene: Scene,
    a: Analysis,
    ms: number,
  ) {
    drawScene(ctx, w, h, scene, a, getTheme(scene.theme), phase, doc.sensitivity, detail);
    const mix = Math.min(1, (ms - changed) / (doc.transition * 1000 || 1));
    if (previous && mix < 1) {
      drawScene(
        sc,
        w,
        h,
        previous,
        a,
        getTheme(previous.theme),
        phase,
        doc.sensitivity,
        detail,
      );
      ctx.globalAlpha = 1 - mix;
      ctx.drawImage(sc.canvas, 0, 0);
      ctx.globalAlpha = 1;
    }
    // 节拍闪光与黑场对两个目标使用完全相同的判定
    if (doc.strobe && a.beat) {
      ctx.fillStyle = "#ffffff66";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = `rgba(0,0,0,${doc.blackout ? 1 : 1 - doc.master})`;
    ctx.fillRect(0, 0, w, h);
  }

  function render(ms: number) {
    const dt = Math.min(0.08, (ms - last) / 1000) || 0;
    last = ms;
    const scene =
      doc.scenes.find((s) => s.id === doc.activeId) ?? doc.scenes[0];
    if (current !== scene.id) {
      previous = doc.scenes.find((s) => s.id === current);
      current = scene.id;
      changed = ms;
    }
    if (!doc.frozen) phase += dt * scene.speed;
    const a = read();

    syncPreviewSize();
    drawFrame(
      c,
      scratchCtx,
      canvas.width,
      canvas.height,
      monitor.state.detail,
      scene,
      a,
      ms,
    );

    if (record) {
      drawFrame(
        record.ctx,
        record.scratchCtx,
        record.size.width,
        record.size.height,
        "high",
        scene,
        a,
        ms,
      );
    }

    monitor.tick(ms);
    raf = requestAnimationFrame(render);
  }

  raf = requestAnimationFrame(render);

  function beginRecording(size: RecordSize): HTMLCanvasElement {
    const rec = document.createElement("canvas");
    rec.width = size.width;
    rec.height = size.height;
    const recScratch = document.createElement("canvas");
    recScratch.width = size.width;
    recScratch.height = size.height;
    record = {
      canvas: rec,
      ctx: rec.getContext("2d")!,
      scratch: recScratch,
      scratchCtx: recScratch.getContext("2d")!,
      size,
    };
    monitor.setRecording(true);
    monitor.clampPreviewForRecording();
    return rec;
  }

  function endRecording() {
    record = undefined;
    monitor.setRecording(false);
  }

  return {
    beginRecording,
    endRecording,
    dispose: () => cancelAnimationFrame(raf),
  };
}

export type StageRenderer = ReturnType<typeof createRenderer>;
