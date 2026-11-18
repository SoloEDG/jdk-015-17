import type { QualityState, RecordSize } from "../../../shared/types";

export const RECORD_SIZES: RecordSize[] = [
  { label: "1080P 高清", width: 1920, height: 1080 },
  { label: "720P 标准", width: 1280, height: 720 },
  { label: "540P 节能", width: 960, height: 540 },
];

export interface Feasibility {
  ok: boolean;
  risk: boolean;
  message: string;
  /** 预检认为更稳妥的可选尺寸；ok 且非 risk 时与请求一致 */
  alternatives: RecordSize[];
}

function has(size: RecordSize, list: RecordSize[]) {
  return list.some((s) => s.width === size.width && s.height === size.height);
}

/**
 * 录制开始前的资源可行性判断：只在开始前给出可行选择，
 * 一旦正式开始，输出尺寸在整段录制中锁定不变。
 */
export function checkFeasibility(
  requested: RecordSize,
  quality: QualityState,
): Feasibility {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    return {
      ok: false,
      risk: false,
      message: "此浏览器不支持舞台录制（缺少 MediaRecorder / captureStream）。",
      alternatives: [],
    };
  }

  const fps = quality.fps || 60;
  const pixels = requested.width * requested.height;
  // 经验预算：以当前预览帧率推断的每帧可承受像素量，留约 35% 余量给编码与音频
  const budget = quality.cssWidth * quality.cssHeight * Math.max(0.4, fps / 60) * 0.65;
  const fit = RECORD_SIZES.filter((s) => s.width * s.height <= Math.max(budget, 960 * 540));
  const recommended = fit.length ? fit[0] : RECORD_SIZES[RECORD_SIZES.length - 1];

  if (fps < 24) {
    return {
      ok: true,
      risk: true,
      message: `当前预览帧率约 ${fps} FPS，直接录制 ${requested.label} 可能卡顿。建议先选择 ${recommended.label}，或关闭其他占用后再试。`,
      alternatives: dedupe([recommended, ...RECORD_SIZES], requested),
    };
  }
  if (pixels > budget) {
    return {
      ok: true,
      risk: true,
      message: `${requested.label} 的渲染量高于当前性能预算（预览 ${fps} FPS）。建议改用 ${recommended.label}；仍坚持原尺寸可能出现掉帧，但不会在录制中途偷偷更改尺寸。`,
      alternatives: dedupe([recommended, ...RECORD_SIZES], requested),
    };
  }
  return {
    ok: true,
    risk: false,
    message: `将以 ${requested.width} × ${requested.height} · 30 FPS 录制，录制期间尺寸锁定。`,
    alternatives: [requested],
  };
}

function dedupe(list: RecordSize[], requested: RecordSize) {
  const out: RecordSize[] = [];
  for (const s of list) if (!has(s, out)) out.push(s);
  if (!has(requested, out)) out.push(requested);
  return out;
}
