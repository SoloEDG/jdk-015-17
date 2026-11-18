import type { Analysis, DetailLevel, Scene, Theme } from "../../../shared/types";

interface DetailProfile {
  rings: number;
  ringSegments: number;
  particles: number;
  bars: number;
  waveLines: number;
  tunnelRects: number;
  shadow: boolean;
}

// 仅调节粒子与线条密度；节拍脉冲(pulse)、速度(phase)、构图比例保持不变
const PROFILES: Record<DetailLevel, DetailProfile> = {
  high: { rings: 7, ringSegments: 256, particles: 65, bars: 64, waveLines: 6, tunnelRects: 20, shadow: true },
  medium: { rings: 5, ringSegments: 160, particles: 36, bars: 48, waveLines: 4, tunnelRects: 14, shadow: true },
  low: { rings: 4, ringSegments: 96, particles: 18, bars: 32, waveLines: 3, tunnelRects: 9, shadow: false },
};

export function drawScene(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: Scene,
  a: Analysis,
  t: Theme,
  phase: number,
  sensitivity: number,
  detail: DetailLevel = "high",
) {
  const d = PROFILES[detail];
  const cx = w / 2,
    cy = h / 2,
    base = Math.min(w, h) * 0.23,
    power = Math.min(2, a.rms * sensitivity * 4),
    pulse = 1 + a.bass * 0.12;
  c.fillStyle = t.background;
  c.fillRect(0, 0, w, h);
  const glow = c.createRadialGradient(cx, cy, 0, cx, cy, w * 0.48);
  glow.addColorStop(0, t.colors[0] + "25");
  glow.addColorStop(1, t.background);
  c.fillStyle = glow;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = t.colors[0];
  c.lineWidth = 1.3;
  c.shadowColor = t.colors[0];
  c.shadowBlur = d.shadow ? 12 : 0;
  if (s.kind === "orbit") {
    for (let ring = 0; ring < d.rings; ring++) {
      c.beginPath();
      for (let i = 0; i <= d.ringSegments; i++) {
        const q = (i / d.ringSegments) * Math.PI * 2;
        const bin = a.bins[Math.floor((i / d.ringSegments) * a.bins.length)] ?? 0;
        const r =
          base * (0.68 + ring * 0.065) * pulse +
          (Math.sin(q * 5 + phase * 0.8 + ring) * 8 + bin * power * 48) *
            s.intensity;
        const x = cx + Math.cos(q + phase * 0.08) * r,
          y = cy + Math.sin(q + phase * 0.08) * r * 0.94;
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.strokeStyle = t.colors[ring % 3] + (ring < 3 ? "e0" : "65");
      c.stroke();
    }
    for (let i = 0; i < d.particles; i++) {
      const q = i * 2.399 + phase * 0.025,
        r = base * (1.2 + (i % 11) / 10);
      c.fillStyle = t.colors[i % 3] + "90";
      c.beginPath();
      c.arc(
        cx + Math.cos(q) * r,
        cy + Math.sin(q) * r,
        0.7 + (i % 3) * 0.4,
        0,
        7,
      );
      c.fill();
    }
  } else if (s.kind === "spectrum") {
    const n = d.bars,
      bw = (w * 0.72) / n;
    for (let i = 0; i < n; i++) {
      const v = a.bins[Math.floor((i * a.bins.length) / n)] || 0.015;
      const bh = 12 + v * h * 0.45 * s.intensity * sensitivity;
      c.fillStyle = t.colors[i % 3];
      c.fillRect(w * 0.14 + i * bw, cy - bh / 2, bw * 0.55, bh);
    }
  } else if (s.kind === "wave") {
    const step = Math.max(1, Math.floor(a.wave.length / 128));
    for (let j = 0; j < d.waveLines; j++) {
      c.beginPath();
      let first = true;
      for (let i = 0; i < a.wave.length; i += step) {
        const v = a.wave[i];
        const x = (i / (a.wave.length - 1)) * w;
        const y =
          cy +
          Math.sin(i * 0.03 + phase + j * 0.4) * 18 +
          v * h * 0.3 * s.intensity * sensitivity +
          j * 7;
        first ? ((first = false), c.moveTo(x, y)) : c.lineTo(x, y);
      }
      c.strokeStyle = t.colors[j % 3] + "b0";
      c.stroke();
    }
  } else {
    for (let i = 0; i < d.tunnelRects; i++) {
      const z = (i / d.tunnelRects + phase * 0.06) % 1;
      const r = z * z * Math.max(w, h) * 0.8;
      c.save();
      c.translate(cx, cy);
      c.rotate(phase * 0.1 + z);
      c.strokeStyle =
        t.colors[i % 3] +
        Math.floor(z * 200 + 30)
          .toString(16)
          .padStart(2, "0");
      c.strokeRect(-r * pulse, -r * pulse, r * 2 * pulse, r * 2 * pulse);
      c.restore();
    }
  }
  c.shadowBlur = 0;
}
