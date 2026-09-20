"use client";
import { useEffect, useRef } from "react";

/**
 * A penalty kick drawn entirely from dots, on a 2D canvas.
 * Pitch lines and grass in perspective, a goal with a net, a striker who runs
 * up and kicks, a keeper who dives the wrong way, and a ball that flies on an
 * arc into the top corner — then it loops. Original, stylized, no text.
 */

const W = 900;
const H = 560;
const LOOP = 4.8;

type Pt = [number, number];
// perspective: u across the pitch (0..1), v depth (0 near → 1 far)
const ROT = -0.42; // rotate the pitch so the lines run diagonally, like a side-on TV angle
const PIV: Pt = [0.85, 0.78];
const proj = (u0: number, v0: number): Pt => {
  const du = u0 - PIV[0], dv = v0 - PIV[1];
  const u = PIV[0] + du * Math.cos(ROT) - dv * Math.sin(ROT);
  const v = PIV[1] + du * Math.sin(ROT) + dv * Math.cos(ROT);
  return [450 + (u - 0.6) * 980 * (1 - 0.34 * v), 540 - v * 470 * (1 - 0.22 * v)];
};
const depthScale = (v0: number) => 1 - 0.34 * (PIV[1] + (v0 - PIV[1]) * Math.cos(ROT));
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ramp = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
// deterministic jitter so dots on animated bones don't shimmer
const hash = (i: number, j: number) => {
  let x = (i * 374761393 + j * 668265263) >>> 0;
  x = ((x ^ (x >>> 13)) * 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296 - 0.5;
};

// goal geometry (pitch units): goal line at v=0.9, centred at u=0.78
const GOAL_U0 = 0.73, GOAL_U1 = 0.97, GOAL_V = 0.78, POST_PX = 215;
const SPOT: Pt = [0.85, 0.46];

export default function PenaltyScene() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rand = rng(11);
    // ---- static layers -----------------------------------------------------
    const grass: { x: number; y: number; a: number }[] = [];
    for (let i = 0; i < 26000; i++) {
      const u = -1.2 + rand() * 3.2, v = -0.7 + rand() * 2.0;
      const [x, y] = proj(u, v);
      if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
      const stripe = Math.floor((u + 0.2) * 7) % 2 === 0 ? 1 : 0.72;
      grass.push({ x, y, a: (0.42 + rand() * 0.4) * stripe * (1 - 0.25 * clamp(v)) });
    }
    const lineDots: { x: number; y: number; a: number }[] = [];
    const dotted = (pts: Pt[], density = 300, a = 0.8) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [u0, v0] = pts[i], [u1, v1] = pts[i + 1];
        const n = Math.max(2, Math.round(Math.hypot(u1 - u0, (v1 - v0) * 1.4) * density));
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const [x, y] = proj(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t);
          lineDots.push({ x: x + (rand() - 0.5) * 1.6, y: y + (rand() - 0.5) * 1.6, a });
        }
      }
    };
    const bx0 = 0.85 - 0.66, bx1 = 0.85 + 0.66; // penalty box (40.3m wide, 16.5m deep)
    dotted([[bx0, 0.3], [bx0, GOAL_V], [bx1, GOAL_V], [bx1, 0.3], [bx0, 0.3]], 300, 0.9);
    dotted([[0.85 - 0.3, 0.62], [0.85 - 0.3, GOAL_V], [0.85 + 0.3, GOAL_V], [0.85 + 0.3, 0.62], [0.85 - 0.3, 0.62]], 300, 0.9); // goal area
    dotted([[-0.2, GOAL_V], [1.5, GOAL_V]], 300, 0.7); // goal line
    dotted([[0.03, -0.05], [0.03, GOAL_V]], 300, 0.6); // touchline
    // penalty arc (outside the box only)
    {
      const arc: Pt[] = [];
      for (let a = Math.PI * 1.08; a <= Math.PI * 1.92; a += 0.05) {
        const u = SPOT[0] + Math.cos(a) * 0.3, v = SPOT[1] + Math.sin(a) * 0.265;
        if (v < 0.3) arc.push([u, v]);
      }
      if (arc.length > 1) dotted(arc, 300, 0.7);
    }
    // penalty spot
    {
      const [sx, sy] = proj(SPOT[0], SPOT[1]);
      for (let i = 0; i < 10; i++) lineDots.push({ x: sx + (rand() - 0.5) * 5, y: sy + (rand() - 0.5) * 3, a: 0.9 });
    }
    // goal frame + net (net dots are jittered on impact)
    const frame: { x: number; y: number; a: number }[] = [];
    const net: { x: number; y: number; a: number }[] = [];
    {
      const [lx, ly] = proj(GOAL_U0, GOAL_V), [rx, ry] = proj(GOAL_U1, GOAL_V);
      const ph = POST_PX * depthScale(GOAL_V);
      for (let t = 0; t <= 1; t += 0.012) {
        frame.push({ x: lx, y: ly - ph * t, a: 1 }, { x: rx, y: ry - ph * t, a: 1 });
        frame.push({ x: lerp(lx, rx, t), y: lerp(ly, ry, t) - ph, a: 1 });
      }
      // net: back panel (deeper) + side panels + top, as a grid
      const [blx, bly] = proj(GOAL_U0 + 0.01, GOAL_V + 0.06), [brx, bry] = proj(GOAL_U1 - 0.01, GOAL_V + 0.06);
      const bph = POST_PX * depthScale(GOAL_V + 0.06) * 0.92;
      for (let i = 0; i <= 24; i++) for (let j = 0; j <= 15; j++) {
        const s = i / 24, t = j / 15;
        net.push({ x: lerp(blx, brx, s), y: lerp(bly, bry, s) - bph * t, a: 0.3 });
      }
      for (let i = 0; i <= 5; i++) for (let j = 0; j <= 9; j++) { // sides
        const s = i / 5, t = j / 9;
        net.push({ x: lerp(lx, blx, s), y: lerp(ly, bly, s) - lerp(ph, bph, s) * t, a: 0.22 });
        net.push({ x: lerp(rx, brx, s), y: lerp(ry, bry, s) - lerp(ph, bph, s) * t, a: 0.22 });
      }
      for (let i = 0; i <= 14; i++) for (let j = 0; j <= 5; j++) { // roof
        const s = i / 14, t = j / 5;
        net.push({ x: lerp(lerp(lx, rx, s), lerp(blx, brx, s), t), y: lerp(lerp(ly, ry, s) - ph, lerp(bly, bry, s) - bph, t), a: 0.2 });
      }
    }

    // ---- figures --------------------------------------------------------------
    type Pose = { head: Pt; neck: Pt; hip: Pt; kL: Pt; kR: Pt; fL: Pt; fR: Pt; eL: Pt; eR: Pt; hL: Pt; hR: Pt };
    const mix = (a: Pose, b: Pose, t: number): Pose => {
      const m = (p: Pt, q: Pt): Pt => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
      return { head: m(a.head, b.head), neck: m(a.neck, b.neck), hip: m(a.hip, b.hip), kL: m(a.kL, b.kL), kR: m(a.kR, b.kR), fL: m(a.fL, b.fL), fR: m(a.fR, b.fR), eL: m(a.eL, b.eL), eR: m(a.eR, b.eR), hL: m(a.hL, b.hL), hR: m(a.hR, b.hR) };
    };
    // figure space: x right, y up, feet at 0, height ~1
    const runPose = (phi: number): Pose => {
      const s = Math.sin(phi), c = Math.cos(phi);
      return {
        head: [0.06, 0.93], neck: [0.04, 0.8], hip: [0, 0.5],
        fL: [0.22 * s, 0.06 * Math.max(0, c)], fR: [-0.22 * s, 0.06 * Math.max(0, -c)],
        kL: [0.12 * s + 0.06, 0.28 + 0.04 * Math.max(0, c)], kR: [-0.12 * s + 0.06, 0.28 + 0.04 * Math.max(0, -c)],
        eL: [-0.14 * s - 0.02, 0.64], eR: [0.14 * s - 0.02, 0.64], hL: [-0.24 * s + 0.02, 0.56], hR: [0.24 * s + 0.02, 0.56],
      };
    };
    const kickPose = (k: number): Pose => {
      // plant left foot, right leg swings back → through
      const sw = k < 0.4 ? -k / 0.4 : (k - 0.4) / 0.6; // -1 (back) … +1 (through)
      const fx = sw < 0 ? -0.36 * -sw : 0.5 * sw, fy = sw < 0 ? 0.16 * -sw : 0.42 * sw;
      return {
        head: [-0.04 - 0.08 * Math.max(0, sw), 0.92], neck: [-0.03, 0.79], hip: [0.02, 0.5],
        fL: [-0.16, 0], kL: [-0.1, 0.27], fR: [fx, fy], kR: [(fx * 0.5) + 0.05, 0.3 + fy * 0.4],
        eL: [-0.32, 0.66], hL: [-0.46, 0.72], eR: [0.26, 0.62], hR: [0.36, 0.5],
      };
    };
    const keeperReady: Pose = { head: [0, 0.84], neck: [0, 0.72], hip: [0, 0.44], kL: [-0.2, 0.24], kR: [0.2, 0.24], fL: [-0.26, 0], fR: [0.26, 0], eL: [-0.32, 0.5], eR: [0.32, 0.5], hL: [-0.48, 0.34], hR: [0.48, 0.34] };
    const keeperDive: Pose = { head: [0.92, 0.62], neck: [0.78, 0.56], hip: [0.36, 0.34], kL: [0.06, 0.28], kR: [0.14, 0.14], fL: [-0.26, 0.24], fR: [-0.14, 0.04], eL: [1.02, 0.7], eR: [0.98, 0.5], hL: [1.28, 0.86], hR: [1.24, 0.6] };

    type Kit = { body: string; thigh: string; shin: string; head: string };
    const drawFigure = (p: Pose, ox: number, oy: number, sc: number, kit: Kit, id: number, alpha: number) => {
      const T = (q: Pt): Pt => [ox + q[0] * sc, oy - q[1] * sc];
      const bones: [Pt, Pt][] = [
        [p.neck, p.hip], [p.hip, p.kL], [p.kL, p.fL], [p.hip, p.kR], [p.kR, p.fR],
        [p.neck, p.eL], [p.eL, p.hL], [p.neck, p.eR], [p.eR, p.hR],
      ];
      const partColor = (bi: number) => (bi === 1 || bi === 3 ? kit.thigh : bi === 2 || bi === 4 ? kit.shin : kit.body);
      bones.forEach(([a, b], bi) => {
        ctx.fillStyle = partColor(bi).replace(")", `,${alpha})`).replace("rgb(", "rgba(");
        const [ax, ay] = T(a), [bx, by] = T(b);
        const len = Math.hypot(bx - ax, by - ay);
        const n = Math.max(3, Math.round(len / 2.2));
        const thick = (bi === 0 ? 0.075 : 0.045) * sc;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const jx = hash(id * 31 + bi, i) * thick * 2, jy = hash(id * 31 + bi + 7, i) * thick * 2;
          ctx.fillRect(lerp(ax, bx, t) + jx, lerp(ay, by, t) + jy, 2.0, 2.0);
        }
      });
      const [hx, hy] = T(p.head);
      ctx.fillStyle = kit.head.replace(")", `,${alpha})`).replace("rgb(", "rgba(");
      const r = 0.085 * sc;
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2, rr = r * (0.55 + hash(id * 91, i) * 0.6 + 0.3);
        ctx.fillRect(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr, 2.0, 2.0);
      }
    };

    // ---- animation ----------------------------------------------------------
    const trail: Pt[] = [];
    let raf = 0;
    const t0 = performance.now();
    const draw = () => {
      const t = ((performance.now() - t0) / 1000) % LOOP;
      const fade = 1 - ramp(t, 4.25, 4.7);
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = fade;

      // grass + lines
      for (const g of grass) { ctx.fillStyle = `rgba(92,200,88,${g.a})`; ctx.fillRect(g.x, g.y, 2.1, 2.1); }
      for (const d of lineDots) { ctx.fillStyle = `rgba(255,255,255,${d.a})`; ctx.fillRect(d.x, d.y, 1.6, 1.6); }

      // net (ripples after impact) + frame
      const ripple = Math.max(0, 1 - ramp(t, 1.72, 2.5)) * (t > 1.72 ? 1 : 0);
      for (let i = 0; i < net.length; i++) {
        const n = net[i];
        const jx = ripple * 5 * Math.sin(t * 30 + i), jy = ripple * 4 * Math.cos(t * 26 + i * 1.7);
        ctx.fillStyle = `rgba(255,255,255,${n.a})`;
        ctx.fillRect(n.x + jx, n.y + jy, 1.4, 1.4);
      }
      for (const f of frame) { ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fillRect(f.x, f.y, 1.8, 1.8); }

      // keeper (far, small) — dives right, the wrong way
      {
        const d = easeOut(ramp(t, 1.05, 1.55));
        const [kx, ky] = proj(0.78 + 0.03 * d, GOAL_V - 0.01);
        const sc = POST_PX * depthScale(GOAL_V) * 0.78;
        drawFigure(mix(keeperReady, keeperDive, d), kx - sc * 0.1, ky, sc, { body: "rgb(249,115,22)", thigh: "rgb(249,115,22)", shin: "rgb(255,160,80)", head: "rgb(240,214,190)" }, 2, 1);
      }

      // striker: run-up from lower-left to the spot, then the kick
      {
        const run = easeIn(ramp(t, 0, 0.95));
        const u = lerp(0.62, SPOT[0] - 0.035, run), v = lerp(0.3, SPOT[1] - 0.02, run);
        const [sx, sy] = proj(u, v);
        const sc = POST_PX * depthScale(v) * 1.05;
        const k = ramp(t, 0.95, 1.22);
        const pose = t < 0.95 ? runPose(t * 11) : kickPose(k);
        drawFigure(pose, sx, sy, sc, { body: "rgb(40,70,160)", thigh: "rgb(235,240,255)", shin: "rgb(220,40,50)", head: "rgb(240,214,190)" }, 1, 1);
      }

      // ball: rests on the spot, then flies on an arc into the top-left corner
      {
        const fl = ramp(t, 1.1, 1.72);
        const u = lerp(SPOT[0], GOAL_U0 + 0.03, fl), v = lerp(SPOT[1], GOAL_V + 0.03, fl);
        const [bx, by0] = proj(u, v);
        const ph = POST_PX * depthScale(v);
        const h = t < 1.1 ? 0 : (0.84 * fl + 0.5 * fl * (1 - fl)) * ph;
        const by = by0 - h;
        const r = 5.5 * depthScale(v);
        if (t < 1.1 || fl >= 1) { /* hold */ }
        if (t >= 1.1 && fl < 1) { trail.push([bx, by]); if (trail.length > 26) trail.shift(); }
        if (t < 1.1) trail.length = 0;
        trail.forEach(([tx, ty], i) => { ctx.fillStyle = `rgba(255,255,255,${(i / trail.length) * 0.5})`; ctx.fillRect(tx, ty, 1.5, 1.5); });
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2, rr = r * (0.5 + hash(5, i) * 0.6 + 0.3);
          ctx.fillStyle = i % 5 === 0 ? "rgba(225,45,55,0.95)" : "rgba(255,255,255,0.95)";
          ctx.fillRect(bx + Math.cos(a) * rr, by + Math.sin(a) * rr, 1.7, 1.7);
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="h-auto w-full" style={{ aspectRatio: `${W} / ${H}` }} aria-hidden />;
}
