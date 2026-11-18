export type SceneKind = "orbit" | "spectrum" | "wave" | "tunnel";
export type DetailLevel = "high" | "medium" | "low";
export interface QualityState {
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  fps: number;
  detail: DetailLevel;
  fullscreen: boolean;
  recording: boolean;
  reasons: string[];
}
export interface RecordSize {
  label: string;
  width: number;
  height: number;
}
export interface Scene {
  id: string;
  name: string;
  kind: SceneKind;
  theme: string;
  intensity: number;
  speed: number;
}
export interface Analysis {
  bins: number[];
  wave: number[];
  rms: number;
  bass: number;
  beat: boolean;
  time: number;
}
export interface StageDocument {
  scenes: Scene[];
  activeId: string;
  gain: number;
  sensitivity: number;
  smoothing: number;
  transition: number;
  blackout: boolean;
  frozen: boolean;
  strobe: boolean;
  master: number;
}
export interface Take {
  id: string;
  url: string;
  size: number;
  duration: number;
  name: string;
  mime: string;
}
export interface Theme {
  id: string;
  name: string;
  colors: [string, string, string];
  background: string;
}
