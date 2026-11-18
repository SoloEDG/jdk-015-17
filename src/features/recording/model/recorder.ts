import { reactive } from "vue";
import type { RecordSize, Take } from "../../../shared/types";
import type { StageRenderer } from "../../visuals/model/renderer";
import { recordingMime, takeName } from "../lib/format";

export function createRecorder() {
  const state = reactive({
    status: "idle" as "idle" | "recording" | "saving",
    error: "",
    elapsed: 0,
    takes: [] as Take[],
    size: undefined as RecordSize | undefined,
  });
  let recorder: MediaRecorder | undefined,
    chunks: Blob[] = [],
    started = 0,
    timer = 0,
    videoStream: MediaStream | undefined,
    boundRenderer: StageRenderer | undefined;

  /**
   * 录制在开始时即锁定输出尺寸：
   * 录制画布由渲染器按固定尺寸独立绘制，预览的自适应/降级对其没有影响。
   * 全程只有渲染器那一条 rAF 循环，不新增动画循环或音频采样。
   */
  function start(
    renderer: StageRenderer,
    size: RecordSize,
    audio: MediaStream,
  ): boolean {
    if (state.status !== "idle") return false;
    state.error = "";
    let target: HTMLCanvasElement | undefined;
    try {
      if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream)
        throw Error("此浏览器不支持舞台录制");

      target = renderer.beginRecording(size);
      const mime = recordingMime();
      videoStream = target.captureStream(30);
      const stream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audio.getAudioTracks(),
      ]);
      recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );

      chunks = [];
      boundRenderer = renderer;
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, {
          type: recorder?.mimeType || recordingMime(),
        });
        state.takes.unshift({
          id: crypto.randomUUID(),
          url: URL.createObjectURL(blob),
          size: blob.size,
          duration: state.elapsed,
          name: takeName(blob.type),
          mime: blob.type,
        });
        finish();
        state.status = "idle";
      };
      recorder.onerror = () => {
        state.error = "录制失败，请重新开始";
        if (recorder?.state === "recording") {
          recorder.stop();
        } else {
          finish();
          state.status = "idle";
        }
      };
      recorder.start(1000);
      started = performance.now();
      state.elapsed = 0;
      state.size = size;
      state.status = "recording";
      timer = window.setInterval(() => {
        state.elapsed = (performance.now() - started) / 1000;
      }, 100);
      return true;
    } catch (e) {
      // 编码器在首帧前就失败：回滚录制目标，立即恢复普通预览
      if (target) renderer.endRecording();
      videoStream?.getTracks().forEach((t) => t.stop());
      videoStream = undefined;
      boundRenderer = undefined;
      state.error = e instanceof Error ? e.message : "无法开始录制";
      state.size = undefined;
      state.status = "idle";
      return false;
    }
  }

  /** 统一收尾：停轨道、销毁录制目标、恢复预览，只执行一次 */
  function finish() {
    clearInterval(timer);
    timer = 0;
    videoStream?.getTracks().forEach((t) => t.stop());
    videoStream = undefined;
    boundRenderer?.endRecording();
    boundRenderer = undefined;
    recorder = undefined;
    state.size = undefined;
  }

  function stop() {
    if (recorder?.state === "recording") {
      state.status = "saving";
      clearInterval(timer);
      timer = 0;
      recorder.stop(); // onstop 中完成 finish()
    }
  }

  function remove(id: string) {
    const i = state.takes.findIndex((t) => t.id === id);
    if (i >= 0) {
      URL.revokeObjectURL(state.takes[i].url);
      state.takes.splice(i, 1);
    }
  }

  function dispose() {
    try {
      recorder?.stop();
    } catch {
      finish();
    }
    state.takes.forEach((t) => URL.revokeObjectURL(t.url));
  }

  return { state, start, stop, remove, dispose };
}

export type StageRecorder = ReturnType<typeof createRecorder>;
