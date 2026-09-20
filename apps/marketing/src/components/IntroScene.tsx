"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import Image from "next/image";

/**
 * Scroll-driven cinematic intro — a wide, aerial point-cloud hall.
 *
 * Every solid object also carries an invisible depth-only solid, so points
 * behind an object are hidden (real occlusion). Seated people introduce
 * themselves on hover. Every screen runs a Tetris board. Two figures start at
 * the right desk and walk toward the camera.
 *
 * Scrolling: the camera first swings around to the LEFT of the right desk's
 * laptop, then comes around to its front. As it approaches, the laptop's
 * screen becomes a live HTML page (the hero) pinned to the screen's four
 * projected corners with a CSS matrix3d homography; on the last stretch that
 * page grows from the laptop out to the full viewport and hands off to the
 * hero below. No text on the page itself. Our own geometry and figures.
 */

const PAL: [number, number, number][] = [
  [1, 1, 1], // 0 white
  [0.98, 0.42, 0.7], // 1 pink
  [0.43, 0.9, 0.7], // 2 emerald
  [0.4, 0.91, 0.98], // 3 cyan
  [0.66, 0.6, 1], // 4 violet
  [1, 0.78, 0.45], // 5 amber
  [1, 0.9, 0.3], // 6 yellow
  [1, 0.38, 0.38], // 7 red
  [1, 0.6, 0.25], // 8 orange
  [0.4, 0.58, 1], // 9 blue
];
const TETRIS_COLORS = [1, 2, 3, 4, 6, 7, 8, 9];

const VERT = `
precision highp float;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform float uTime;
uniform float uPixel;
uniform float uFade;
attribute vec3 position;
attribute vec3 color;
attribute float aPhase;
attribute float aSize;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // static dots: no time-based twinkle, so nothing flickers or drifts
  float s = aSize * uPixel * (26.0 / max(-mv.z, 0.5));
  gl_PointSize = clamp(s, 1.0, 3.0 * uPixel);
  vColor = color;
  vAlpha = uFade;
}`;

const FRAG = `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.28, d);
  gl_FragColor = vec4(vColor, soft * vAlpha);
}`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ramp = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const R = 22;
const WALL_H = 7;
const VAULT_H = 8; // rounder barrel vault
const Z_FRONT = 14;
const Z_BACK = -84;
const DETAIL = 2.4;

/* The target laptop (right desk). Tilted slightly to the left. */
const LAP = { x: 8.6, y: 1.22, z: -11.9, yaw: -0.3 };
const LAPTOP = { w: 0.95, d: 0.66, h: 0.64, tilt: 1.2 };
/** World point on the laptop screen: lx across (−w/2..w/2), t up the lid (0..1). */
function laptopScreenPoint(lx: number, t: number, lift = 0.02): V {
  const { d, h, tilt } = LAPTOP;
  const lz = -d / 2 - Math.cos(tilt) * h * t + lift * Math.sin(tilt);
  const ly = Math.sin(tilt) * h * t + lift * Math.cos(tilt);
  const cy = Math.cos(LAP.yaw), sy = Math.sin(LAP.yaw);
  return [LAP.x + lx * cy + lz * sy, LAP.y + ly, LAP.z - lx * sy + lz * cy];
}

type V = [number, number, number];
type Arr = { pos: number[]; col: number[]; size: number[]; phase: number[] };
type Occ =
  | { k: "box"; x: number; y: number; z: number; w: number; h: number; d: number; ry?: number; rx?: number }
  | { k: "cyl"; x: number; y: number; z: number; r: number; h: number }
  | { k: "sph"; x: number; y: number; z: number; r: number };
type Person = { x: number; y: number; z: number; name: string; role: string };

function rngFn(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ----------------------------------------------------- 2D homography (CSS) */
type M3 = number[];
const adj = (m: M3): M3 => [
  m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
  m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
  m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
];
const mulM = (a: M3, b: M3): M3 => {
  const c: M3 = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) c[3 * i + j] += a[3 * i + k] * b[3 * k + j];
  return c;
};
const mulV = (m: M3, v: number[]) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const basisToPoints = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): M3 => {
  const m: M3 = [x1, x2, x3, y1, y2, y3, 1, 1, 1];
  const v = mulV(adj(m), [x4, y4, 1]);
  return mulM(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
};
/** matrix3d mapping a w×h box (origin top-left) onto 4 screen points: TL, TR, BL, BR. */
function matrix3dFor(w: number, h: number, p: number[][]): string {
  const s = basisToPoints(0, 0, w, 0, 0, h, w, h);
  const d = basisToPoints(p[0][0], p[0][1], p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]);
  const t = mulM(d, adj(s));
  const n = t.map((v) => v / t[8]);
  return `matrix3d(${n[0]},${n[3]},0,${n[6]},${n[1]},${n[4]},0,${n[7]},0,0,1,0,${n[2]},${n[5]},0,${n[8]})`;
}

/* --------------------------------------------------------------- human rig */
const J = { hipL: 0, hipR: 1, kneeL: 2, kneeR: 3, footL: 4, footR: 5, shL: 6, shR: 7, elL: 8, elR: 9, haL: 10, haR: 11, headC: 12, hipMid: 13, shMid: 14, headBase: 15, tipL: 16, tipR: 17 };
type Seg =
  | { k: "cap"; a: number; b: number; r0: number; r1: number; n: number; bm: number }
  | { k: "ell"; c: number; rx: number; ry: number; rz: number; n: number; bm: number };
type Sample = { seg: number; t: number; u: number; v: number; rj: number };
type Rig = { H: number; segs: Seg[]; samples: Sample[] };

function makeRig(H: number, dens: number, rand: () => number): Rig {
  const n = (x: number) => Math.max(2, Math.round(x * dens));
  const segs: Seg[] = [
    { k: "cap", a: J.hipMid, b: J.shMid, r0: 0.12 * H, r1: 0.15 * H, n: n(200), bm: 1 },
    { k: "ell", c: J.hipMid, rx: 0.14 * H, ry: 0.09 * H, rz: 0.1 * H, n: n(55), bm: 1 },
    { k: "cap", a: J.shMid, b: J.headBase, r0: 0.04 * H, r1: 0.045 * H, n: n(18), bm: 1 },
    { k: "ell", c: J.headC, rx: 0.085 * H, ry: 0.1 * H, rz: 0.088 * H, n: n(110), bm: 1.15 },
    { k: "cap", a: J.shL, b: J.elL, r0: 0.05 * H, r1: 0.04 * H, n: n(50), bm: 1 },
    { k: "cap", a: J.elL, b: J.haL, r0: 0.04 * H, r1: 0.03 * H, n: n(44), bm: 1 },
    { k: "cap", a: J.shR, b: J.elR, r0: 0.05 * H, r1: 0.04 * H, n: n(50), bm: 1 },
    { k: "cap", a: J.elR, b: J.haR, r0: 0.04 * H, r1: 0.03 * H, n: n(44), bm: 1 },
    { k: "ell", c: J.haL, rx: 0.04 * H, ry: 0.04 * H, rz: 0.04 * H, n: n(14), bm: 1 },
    { k: "ell", c: J.haR, rx: 0.04 * H, ry: 0.04 * H, rz: 0.04 * H, n: n(14), bm: 1 },
    { k: "cap", a: J.hipL, b: J.kneeL, r0: 0.075 * H, r1: 0.055 * H, n: n(90), bm: 1 },
    { k: "cap", a: J.kneeL, b: J.footL, r0: 0.055 * H, r1: 0.04 * H, n: n(78), bm: 1 },
    { k: "cap", a: J.hipR, b: J.kneeR, r0: 0.075 * H, r1: 0.055 * H, n: n(90), bm: 1 },
    { k: "cap", a: J.kneeR, b: J.footR, r0: 0.055 * H, r1: 0.04 * H, n: n(78), bm: 1 },
    { k: "ell", c: J.tipL, rx: 0.05 * H, ry: 0.03 * H, rz: 0.09 * H, n: n(16), bm: 1 },
    { k: "ell", c: J.tipR, rx: 0.05 * H, ry: 0.03 * H, rz: 0.09 * H, n: n(16), bm: 1 },
  ];
  const samples: Sample[] = [];
  segs.forEach((s, i) => {
    for (let k = 0; k < s.n; k++) samples.push({ seg: i, t: rand(), u: rand() * Math.PI * 2, v: Math.acos(2 * rand() - 1), rj: 0.7 + rand() * 0.35 });
  });
  return { H, segs, samples };
}

function poseJoints(H: number, pose: "seated" | "stand" | "walk", phi = 0): V[] {
  const j: V[] = new Array(18);
  const set = (i: number, x: number, y: number, z: number) => (j[i] = [x, y, z]);
  if (pose === "seated") {
    set(J.hipL, -0.09 * H, 0, 0); set(J.hipR, 0.09 * H, 0, 0);
    set(J.kneeL, -0.09 * H, 0.02 * H, 0.26 * H); set(J.kneeR, 0.09 * H, 0.02 * H, 0.26 * H);
    set(J.footL, -0.09 * H, -0.3 * H, 0.3 * H); set(J.footR, 0.09 * H, -0.3 * H, 0.3 * H);
    set(J.shL, -0.13 * H, 0.34 * H, -0.03 * H); set(J.shR, 0.13 * H, 0.34 * H, -0.03 * H);
    set(J.elL, -0.15 * H, 0.17 * H, 0.1 * H); set(J.elR, 0.15 * H, 0.17 * H, 0.1 * H);
    set(J.haL, -0.12 * H, 0.05 * H, 0.26 * H); set(J.haR, 0.12 * H, 0.05 * H, 0.26 * H);
    set(J.headC, 0, 0.47 * H, 0.02 * H);
  } else if (pose === "walk") {
    const sL = Math.sin(phi);
    const sR = Math.sin(phi + Math.PI);
    const bob = 0.02 * H * Math.abs(Math.cos(phi));
    const liftL = 0.02 * H + 0.07 * H * Math.max(0, Math.cos(phi));
    const liftR = 0.02 * H + 0.07 * H * Math.max(0, -Math.cos(phi));
    set(J.hipL, -0.08 * H, 0.5 * H + bob, 0); set(J.hipR, 0.08 * H, 0.5 * H + bob, 0);
    set(J.footL, -0.08 * H, liftL, 0.26 * H * sL); set(J.footR, 0.08 * H, liftR, 0.26 * H * sR);
    set(J.kneeL, -0.09 * H, 0.27 * H + 0.05 * H * Math.max(0, Math.cos(phi)), 0.13 * H * sL + 0.06 * H);
    set(J.kneeR, 0.09 * H, 0.27 * H + 0.05 * H * Math.max(0, -Math.cos(phi)), 0.13 * H * sR + 0.06 * H);
    set(J.shL, -0.13 * H, 0.84 * H + bob, 0.02 * H); set(J.shR, 0.13 * H, 0.84 * H + bob, 0.02 * H);
    set(J.haL, -0.13 * H, 0.5 * H + bob, 0.18 * H * sR); set(J.haR, 0.13 * H, 0.5 * H + bob, 0.18 * H * sL);
    set(J.elL, -0.15 * H, 0.66 * H + bob, 0.08 * H * sR); set(J.elR, 0.15 * H, 0.66 * H + bob, 0.08 * H * sL);
    set(J.headC, 0, 0.95 * H + bob, 0.03 * H);
  } else {
    set(J.hipL, -0.085 * H, 0.5 * H, 0); set(J.hipR, 0.085 * H, 0.5 * H, 0);
    set(J.kneeL, -0.088 * H, 0.27 * H, 0.01 * H); set(J.kneeR, 0.088 * H, 0.27 * H, 0.01 * H);
    set(J.footL, -0.085 * H, 0.02 * H, 0.02 * H); set(J.footR, 0.085 * H, 0.02 * H, 0.02 * H);
    set(J.shL, -0.13 * H, 0.84 * H, 0); set(J.shR, 0.13 * H, 0.84 * H, 0);
    set(J.elL, -0.15 * H, 0.64 * H, 0.02 * H); set(J.elR, 0.15 * H, 0.64 * H, 0.02 * H);
    set(J.haL, -0.145 * H, 0.45 * H, 0.04 * H); set(J.haR, 0.145 * H, 0.45 * H, 0.04 * H);
    set(J.headC, 0, 0.95 * H, 0.01 * H);
  }
  const mid = (a: V, b: V): V => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  j[J.hipMid] = mid(j[J.hipL], j[J.hipR]);
  j[J.shMid] = mid(j[J.shL], j[J.shR]);
  j[J.headBase] = [j[J.headC][0], j[J.headC][1] - 0.09 * H, j[J.headC][2]];
  j[J.tipL] = [j[J.footL][0], j[J.footL][1], j[J.footL][2] + 0.05 * H];
  j[J.tipR] = [j[J.footR][0], j[J.footR][1], j[J.footR][2] + 0.05 * H];
  return j;
}

function evalRig(rig: Rig, joints: V[], yaw: number, cx: number, baseY: number, cz: number, write: (x: number, y: number, z: number, bm: number) => void) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const out = (lx: number, ly: number, lz: number, bm: number) => write(cx + lx * cy + lz * sy, baseY + ly, cz - lx * sy + lz * cy, bm);
  for (let i = 0; i < rig.samples.length; i++) {
    const s = rig.samples[i];
    const seg = rig.segs[s.seg];
    if (seg.k === "ell") {
      const c = joints[seg.c];
      const sv = Math.sin(s.v);
      out(c[0] + seg.rx * sv * Math.cos(s.u), c[1] + seg.ry * Math.cos(s.v), c[2] + seg.rz * sv * Math.sin(s.u), seg.bm);
    } else {
      const a = joints[seg.a];
      const b = joints[seg.b];
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const len = Math.hypot(dx, dy, dz) || 1e-4;
      const ux = dx / len, uy = dy / len, uz = dz / len;
      let upx = 0, upy = 1, upz = 0;
      if (Math.abs(uy) > 0.9) { upx = 1; upy = 0; upz = 0; }
      let p1x = uy * upz - uz * upy, p1y = uz * upx - ux * upz, p1z = ux * upy - uy * upx;
      const p1l = Math.hypot(p1x, p1y, p1z) || 1e-4;
      p1x /= p1l; p1y /= p1l; p1z /= p1l;
      const p2x = uy * p1z - uz * p1y, p2y = uz * p1x - ux * p1z, p2z = ux * p1y - uy * p1x;
      const rr = (seg.r0 + (seg.r1 - seg.r0) * s.t) * s.rj;
      const ca = Math.cos(s.u) * rr, sa = Math.sin(s.u) * rr;
      out(a[0] + dx * s.t + p1x * ca + p2x * sa, a[1] + dy * s.t + p1y * ca + p2y * sa, a[2] + dz * s.t + p1z * ca + p2z * sa, seg.bm);
    }
  }
}

function humanOccluders(cx: number, cz: number, baseY: number, H: number, pose: "seated" | "stand" | "walk", yaw: number): Occ[] {
  const hz = 0.02 * H;
  const hx = cx + hz * Math.sin(yaw), hzz = cz + hz * Math.cos(yaw);
  if (pose === "seated") {
    return [
      { k: "cyl", x: cx, y: baseY, z: cz, r: 0.1 * H, h: 0.36 * H },
      { k: "sph", x: hx, y: baseY + 0.47 * H, z: hzz, r: 0.07 * H },
    ];
  }
  return [
    { k: "cyl", x: cx, y: baseY + 0.02 * H, z: cz, r: 0.085 * H, h: 0.48 * H },
    { k: "cyl", x: cx, y: baseY + 0.5 * H, z: cz, r: 0.1 * H, h: 0.36 * H },
    { k: "sph", x: hx, y: baseY + 0.95 * H, z: hzz, r: 0.07 * H },
  ];
}

/* ------------------------------------------------------------ static scene */
function buildScene(dm: number): { a: Arr; occ: Occ[]; people: Person[] } {
  const rand = rngFn(20260930);
  const a: Arr = { pos: [], col: [], size: [], phase: [] };
  const occ: Occ[] = [];
  const people: Person[] = [];
  const fm = dm * DETAIL;
  const jit = (n: number) => (rand() - 0.5) * n;
  const putRGB = (x: number, y: number, z: number, r: number, g: number, bl: number, size: number) => {
    a.pos.push(x, y, z);
    a.col.push(r, g, bl);
    a.size.push(size);
    a.phase.push(rand() * Math.PI * 2);
  };
  const put = (x: number, y: number, z: number, ci: number, b: number, size: number) => {
    const c = PAL[ci];
    putRGB(x, y, z, c[0] * b, c[1] * b, c[2] * b, size);
  };
  const LEN = Z_FRONT - Z_BACK;
  const dep = (z: number) => clamp((Z_FRONT - z) / LEN);
  const zb = (z: number, near: number, far: number) => lerp(near, far, dep(z));
  const rot = (cx: number, cz: number, yaw: number) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    return (lx: number, lz: number): [number, number] => [cx + lx * cy + lz * sy, cz - lx * sy + lz * cy];
  };

  // ---- floor ---------------------------------------------------------------
  for (let i = 0; i < Math.round(480000 * dm); i++) {
    const u = rand();
    const z = Z_FRONT - Math.pow(u, 2.4) * LEN;
    put(-R + rand() * 2 * R, 0.005 + rand() * 0.03, z, 0, zb(z, 0.36, 0.03) * (0.3 + rand() * 0.95), 0.6);
  }
  const T = 2.0;
  for (let x = -R + 2; x < R; x += T) for (let z = Z_FRONT; z > Z_BACK; z -= 0.1 / dm) put(x + jit(0.06), 0.012, z, 0, zb(z, 0.5, 0.04), 0.65);
  for (let z = Z_FRONT - 1; z > Z_BACK; z -= T) for (let x = -R; x <= R; x += 0.1 / dm) put(x, 0.012, z + jit(0.06), 0, zb(z, 0.5, 0.04), 0.65);

  // ---- roof ----------------------------------------------------------------
  const onArch = (ang: number): [number, number] => [Math.cos(ang) * R, WALL_H + Math.sin(ang) * VAULT_H];
  // soft (triangular) jitter → bands with feathered edges instead of crisp lines
  const tri = (n: number) => (rand() + rand() - 1) * n;
  // vault ribs: many thick, diffuse bands (like scanned steel arches)
  for (let z = Z_FRONT; z > Z_BACK; z -= 7.2) {
    const b = zb(z, 1.0, 0.06);
    for (let ang = 0; ang <= Math.PI + 0.001; ang += 0.0015 / dm) {
      const [x, y] = onArch(ang);
      const nx = Math.cos(ang), ny = Math.sin(ang) * (VAULT_H / R); // arch normal
      const o = tri(0.42);
      put(x + nx * o + tri(0.08), y + ny * o + tri(0.08), z + tri(0.5), 0, b * (0.5 + rand() * 0.7), 0.85);
    }
  }
  // a few subtle longitudinal lines
  const nBars = 8;
  for (let k = 1; k < nBars; k++) {
    const ang = (k / nBars) * Math.PI;
    const [x, y] = onArch(ang);
    for (let z = Z_FRONT; z > Z_BACK; z -= 0.07 / dm) put(x + tri(0.14), y + tri(0.14), z, 0, zb(z, 0.5, 0.04), 0.72);
  }
  // fine haze across the whole vault surface
  for (let i = 0; i < Math.round(320000 * dm); i++) {
    const ang = rand() * Math.PI;
    const [x, y] = onArch(ang);
    const z = Z_FRONT - rand() * LEN;
    put(x + tri(0.4), y + tri(0.4), z, 0, zb(z, 0.2, 0.015) * (0.3 + rand()), 0.55);
  }

  // ---- walls ---------------------------------------------------------------
  // thick, soft wall columns aligned with the ribs
  for (let z = Z_FRONT; z > Z_BACK; z -= 7.2) {
    const b = zb(z, 0.95, 0.06);
    for (let y = 0; y <= WALL_H; y += 0.03 / dm) {
      put(-R + tri(0.32), y, z + tri(0.5), 0, b * (0.6 + rand() * 0.6), 0.75);
      put(R + tri(0.32), y, z + tri(0.5), 0, b * (0.6 + rand() * 0.6), 0.75);
    }
  }
  for (let z = Z_FRONT; z > Z_BACK; z -= 0.07 / dm) {
    const b = zb(z, 0.7, 0.06);
    put(-R + 0.2 + jit(0.08), 4.6 + jit(0.08), z, 0, b, 0.8);
    put(R - 0.2 + jit(0.08), 4.6 + jit(0.08), z, 0, b, 0.8);
  }
  for (let i = 0; i < Math.round(90000 * dm); i++) {
    const z = Z_FRONT - rand() * LEN;
    const side = rand() < 0.5 ? -R : R;
    const y = rand() * WALL_H;
    put(side + jit(0.6), y, z, 0, zb(z, 0.15, 0.015) * (0.4 + rand()) * (y < 2.5 ? 1.4 : 1), 0.58);
  }
  for (let i = 0; i < Math.round(20000 * dm); i++) put(-R + rand() * 2 * R, rand() * (WALL_H + VAULT_H), Z_BACK + jit(0.8), 0, 0.04 + rand() * 0.06, 0.58);
  for (let y = 0; y <= 5; y += 0.1) { put(-3 + jit(0.05), y, Z_BACK + 0.3, 0, 0.2, 0.6); put(3 + jit(0.05), y, Z_BACK + 0.3, 0, 0.2, 0.6); }
  for (let x = -3; x <= 3; x += 0.1) put(x, 5, Z_BACK + 0.3, 0, 0.2, 0.6);

  // ---- Tetris board on any screen plane ------------------------------------
  const tetris = (map: (u: number, v: number) => V, dens: number) => {
    const cols = 10, rows = 18;
    const u0 = 0.2, u1 = 0.8, v0 = 0.06, v1 = 0.94;
    const cw = (u1 - u0) / cols, ch = (v1 - v0) / rows;
    const heights: number[] = [];
    for (let c = 0; c < cols; c++) heights.push(3 + Math.floor(rand() * 6));
    const seedOff = Math.floor(rand() * 8);
    const perCell = Math.max(2, Math.round(5 * dens * fm));
    const cell = (c: number, r: number, ci: number) => {
      for (let i = 0; i < perCell; i++) {
        const p = map(u0 + (c + 0.1 + rand() * 0.8) * cw, v0 + (r + 0.1 + rand() * 0.8) * ch);
        put(p[0], p[1], p[2], ci, 1.0, 0.6);
      }
    };
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < heights[c]; r++) {
        if (r > 1 && rand() < 0.1) continue;
        cell(c, r, TETRIS_COLORS[(Math.floor(c / 2) + Math.floor(r / 2) + seedOff) % TETRIS_COLORS.length]);
      }
    const pc = TETRIS_COLORS[(seedOff + 3) % TETRIS_COLORS.length];
    cell(4, 15, pc); cell(3, 14, pc); cell(4, 14, pc); cell(5, 14, pc);
    for (let t = 0; t <= 1; t += 0.05) {
      const p1 = map(u0, v0 + t * (v1 - v0)), p2 = map(u1, v0 + t * (v1 - v0));
      put(p1[0], p1[1], p1[2], 0, 0.35, 0.5); put(p2[0], p2[1], p2[2], 0, 0.35, 0.5);
    }
  };

  // ---- furniture -----------------------------------------------------------
  const edgesBox = (cx: number, cy: number, cz: number, w: number, h: number, d: number, b: number, sz = 0.7, st = 0.12) => {
    const xs = [cx - w / 2, cx + w / 2], ys = [cy - h / 2, cy + h / 2], zs = [cz - d / 2, cz + d / 2];
    for (const x of xs) for (const y of ys) for (let z = zs[0]; z <= zs[1]; z += st) put(x, y, z, 0, b, sz);
    for (const x of xs) for (const z of zs) for (let y = ys[0]; y <= ys[1]; y += st) put(x, y, z, 0, b, sz);
    for (const y of ys) for (const z of zs) for (let x = xs[0]; x <= xs[1]; x += st) put(x, y, z, 0, b, sz);
  };

  /** Big shared table: a solid WHITE top on two trestle end-panels. */
  const bigTable = (cx: number, cz: number, L: number, D: number, b: number, dens: number) => {
    const top = 1.1;
    edgesBox(cx, top, cz, L, 0.1, D, b, 0.7, 0.06);
    // dense, bright top surface → reads as a solid white slab
    for (let i = 0; i < Math.round(5200 * dens * fm); i++) put(cx - L / 2 + rand() * L, top + 0.055 + jit(0.015), cz - D / 2 + rand() * D, 0, b * (0.82 + rand() * 0.18), 0.64);
    for (let i = 0; i < Math.round(900 * dens * fm); i++) { // front edge face
      put(cx - L / 2 + rand() * L, top - 0.05 + rand() * 0.1, cz + D / 2 + jit(0.01), 0, b * (0.55 + rand() * 0.3), 0.6);
    }
    occ.push({ k: "box", x: cx, y: top, z: cz, w: L - 0.04, h: 0.08, d: D - 0.04 });
    for (const ex of [cx - L / 2 + 0.35, cx + L / 2 - 0.35]) {
      for (let y = 0.05; y <= top - 0.05; y += 0.06) for (const lz of [cz - D / 2 + 0.25, cz + D / 2 - 0.25]) put(ex + jit(0.03), y, lz, 0, b * 0.85, 0.66);
      for (let lz = cz - D / 2 + 0.25; lz <= cz + D / 2 - 0.25; lz += 0.06) { put(ex, 0.08, lz, 0, b * 0.8, 0.66); put(ex, top - 0.08, lz, 0, b * 0.8, 0.66); }
      for (let i = 0; i < Math.round(260 * dens * fm); i++) put(ex + jit(0.04), 0.1 + rand() * (top - 0.2), cz - D / 2 + 0.25 + rand() * (D - 0.5), 0, b * 0.45, 0.58);
      occ.push({ k: "box", x: ex, y: top / 2, z: cz, w: 0.05, h: top - 0.14, d: D - 0.55 });
    }
    for (let x = cx - L / 2 + 0.35; x <= cx + L / 2 - 0.35; x += 0.08) put(x, 0.35, cz, 0, b * 0.6, 0.62);
  };

  const chair = (cx: number, cz: number, yaw: number, b: number, dens: number) => {
    const r = rot(cx, cz, yaw);
    const seatY = 1.05;
    const n = (x: number) => Math.round(x * dens * fm);
    for (let i = 0; i < n(150); i++) { const [x, z] = r(-0.46 + rand() * 0.92, -0.46 + rand() * 0.92); put(x, seatY + jit(0.03), z, 0, b * (0.45 + rand() * 0.55), 0.6); }
    for (let lx = -0.46; lx <= 0.46; lx += 0.08) for (const lz of [-0.46, 0.46]) { const [x, z] = r(lx, lz); put(x, seatY, z, 0, b, 0.68); put(x, seatY - 0.08, z, 0, b * 0.8, 0.64); }
    for (let lz = -0.46; lz <= 0.46; lz += 0.08) for (const lx of [-0.46, 0.46]) { const [x, z] = r(lx, lz); put(x, seatY, z, 0, b, 0.68); }
    const bh = 1.15;
    for (let t = 0; t <= 1; t += 0.06) {
      const y = seatY + bh * t, lz = -0.46 - 0.16 * t;
      for (const lx of [-0.42, 0.42]) { const [x, z] = r(lx, lz); put(x, y, z, 0, b, 0.68); }
    }
    for (let lx = -0.42; lx <= 0.42; lx += 0.08) { const [x, z] = r(lx, -0.62); put(x, seatY + bh, z, 0, b, 0.68); }
    for (let i = 0; i < n(170); i++) { const t = rand(); const [x, z] = r(-0.42 + rand() * 0.84, -0.46 - 0.16 * t); put(x, seatY + bh * t, z, 0, b * (0.4 + rand() * 0.55), 0.58); }
    for (const lx of [-0.5, 0.5]) {
      for (let lz = -0.3; lz <= 0.3; lz += 0.08) { const [x, z] = r(lx, lz); put(x, seatY + 0.42, z, 0, b * 0.9, 0.64); }
      for (let y = seatY; y <= seatY + 0.42; y += 0.08) { const [x, z] = r(lx, 0.05); put(x, y, z, 0, b * 0.8, 0.62); }
    }
    for (let y = 0.14; y < seatY - 0.08; y += 0.07) put(cx + jit(0.03), y, cz + jit(0.03), 0, b * 0.85, 0.68);
    for (let k = 0; k < 5; k++) {
      const ang = (k / 5) * Math.PI * 2 + yaw;
      for (let t = 0; t <= 1; t += 0.12) put(cx + Math.cos(ang) * 0.55 * t, 0.1 + 0.06 * (1 - t), cz + Math.sin(ang) * 0.55 * t, 0, b * 0.75, 0.64);
      for (let i = 0; i < n(10); i++) put(cx + Math.cos(ang) * 0.58 + jit(0.1), 0.06 + rand() * 0.1, cz + Math.sin(ang) * 0.58 + jit(0.1), 0, b * 0.7, 0.6);
    }
    occ.push({ k: "box", x: cx, y: seatY - 0.04, z: cz, w: 0.86, h: 0.06, d: 0.86, ry: yaw });
    const [bx, bz] = r(0, -0.54);
    occ.push({ k: "box", x: bx, y: seatY + bh / 2, z: bz, w: 0.78, h: bh - 0.08, d: 0.06, ry: yaw, rx: -0.14 });
  };

  const laptop = (cx: number, y: number, cz: number, yaw: number, b: number, dens: number) => {
    const r = rot(cx, cz, yaw);
    const { w, d, h, tilt } = LAPTOP;
    const n = (x: number) => Math.round(x * dens * fm);
    for (let lx = -w / 2; lx <= w / 2; lx += 0.05) for (const lz of [-d / 2, d / 2]) { const [x, z] = r(lx, lz); put(x, y, z, 0, b, 0.66); put(x, y - 0.025, z, 0, b * 0.8, 0.62); }
    for (let lz = -d / 2; lz <= d / 2; lz += 0.05) for (const lx of [-w / 2, w / 2]) { const [x, z] = r(lx, lz); put(x, y, z, 0, b, 0.66); put(x, y - 0.025, z, 0, b * 0.8, 0.62); }
    for (let i = 0; i < n(120); i++) { const [x, z] = r(-w / 2 + rand() * w, -d / 2 + rand() * d); put(x, y + 0.005, z, 0, b * 0.35, 0.52); }
    const kw = 0.058, kg = 0.01;
    const kRows = [-0.27, -0.2, -0.13, -0.06];
    kRows.forEach((lz, ri) => {
      const cols = ri === 0 ? 13 : ri === 1 ? 13 : 12;
      const x0 = -((cols * (kw + kg)) / 2);
      for (let c = 0; c < cols; c++) {
        const lx = x0 + c * (kw + kg) + kw / 2;
        for (let i = 0; i < n(7); i++) { const [x, z] = r(lx + (rand() - 0.5) * kw * 0.8, lz + (rand() - 0.5) * kw * 0.7); put(x, y + 0.02, z, 0, b * (0.7 + rand() * 0.3), 0.5); }
      }
    });
    for (let i = 0; i < n(30); i++) { const [x, z] = r((rand() - 0.5) * 0.34, 0.01 + (rand() - 0.5) * kw * 0.7); put(x, y + 0.02, z, 0, b * 0.8, 0.5); }
    for (const lx of [-0.34, 0.34]) for (let i = 0; i < n(7); i++) { const [x, z] = r(lx + (rand() - 0.5) * kw, 0.01 + (rand() - 0.5) * kw * 0.7); put(x, y + 0.02, z, 0, b * 0.8, 0.5); }
    for (let lx = -0.16; lx <= 0.16; lx += 0.03) for (const lz of [0.09, 0.29]) { const [x, z] = r(lx, lz); put(x, y + 0.012, z, 0, b * 0.75, 0.5); }
    for (let lz = 0.09; lz <= 0.29; lz += 0.03) for (const lx of [-0.16, 0.16]) { const [x, z] = r(lx, lz); put(x, y + 0.012, z, 0, b * 0.75, 0.5); }
    for (let t = 0; t <= 1; t += 0.04) {
      const ly = Math.sin(tilt) * h * t, lz = -d / 2 - Math.cos(tilt) * h * t;
      for (const lx of [-w / 2, w / 2]) { const [x, z] = r(lx, lz); put(x, y + ly, z, 0, b, 0.66); }
    }
    for (let lx = -w / 2; lx <= w / 2; lx += 0.05) { const [x, z] = r(lx, -d / 2 - Math.cos(tilt) * h); put(x, y + Math.sin(tilt) * h, z, 0, b, 0.66); }
    for (let lx = -w / 2; lx <= w / 2; lx += 0.05) { const [x, z] = r(lx, -d / 2); put(x, y + 0.01, z, 0, b * 0.9, 0.6); }
    for (let i = 0; i < n(160); i++) { const t = rand(); const [x, z] = r(-w / 2 + rand() * w, -d / 2 - Math.cos(tilt) * h * t); put(x, y + Math.sin(tilt) * h * t, z, 0, b * (0.35 + rand() * 0.4), 0.56); }
    tetris((u, v) => {
      const lx = -w / 2 + 0.06 + u * (w - 0.12);
      const t = 0.06 + v * 0.88;
      const [x, z] = r(lx, -d / 2 - Math.cos(tilt) * h * t + 0.02 * Math.sin(tilt));
      return [x, y + Math.sin(tilt) * h * t + 0.02 * Math.cos(tilt), z];
    }, dens);
    occ.push({ k: "box", x: cx, y: y - 0.015, z: cz, w: w - 0.05, h: 0.03, d: d - 0.05, ry: yaw });
    const [sx, sz] = r(0, -d / 2 - (Math.cos(tilt) * h) / 2);
    occ.push({ k: "box", x: sx, y: y + (Math.sin(tilt) * h) / 2, z: sz, w: w - 0.05, h: h - 0.05, d: 0.03, ry: yaw, rx: -(Math.PI / 2 - tilt) });
  };

  const monitor = (cx: number, cz: number, yaw: number, b: number, dens: number) => {
    const r = rot(cx, cz, yaw);
    const w = 1.6, h = 0.95, cy = 1.1 + 0.4 + h / 2;
    const n = (x: number) => Math.round(x * dens * fm);
    for (let lx = -w / 2; lx <= w / 2; lx += 0.08) { const [x, z] = r(lx, 0); put(x, cy - h / 2, z, 0, b, 0.7); put(x, cy + h / 2, z, 0, b, 0.7); }
    for (let y = -h / 2; y <= h / 2; y += 0.08) { const [x1, z1] = r(-w / 2, 0); const [x2, z2] = r(w / 2, 0); put(x1, cy + y, z1, 0, b, 0.7); put(x2, cy + y, z2, 0, b, 0.7); }
    for (let i = 0; i < n(200); i++) { const [x, z] = r(-w / 2 + rand() * w, 0.03); put(x, cy - h / 2 + rand() * h, z, 0, b * (0.3 + rand() * 0.4), 0.56); }
    tetris((u, v) => { const [x, z] = r(-w / 2 + 0.08 + u * (w - 0.16), 0.05); return [x, cy - h / 2 + 0.06 + v * (h - 0.12), z]; }, dens);
    for (let y = 1.1; y < cy - h / 2; y += 0.06) { const [x, z] = r(0, 0.05); put(x, y, z, 0, b * 0.75, 0.66); }
    for (let lx = -0.4; lx <= 0.4; lx += 0.08) { const [x, z] = r(lx, 0.05); put(x, 1.12, z, 0, b * 0.7, 0.64); }
    occ.push({ k: "box", x: cx, y: cy, z: cz, w: w - 0.06, h: h - 0.06, d: 0.04, ry: yaw });
  };

  const plant = (cx: number, cz: number, sc: number, b: number, dens: number) => {
    const n = (x: number) => Math.round(x * dens * fm);
    const ph = 0.95 * sc;
    for (let i = 0; i < n(320); i++) { const t = rand(); const rr = (0.42 + 0.14 * t) * sc; const ang = rand() * Math.PI * 2; put(cx + Math.cos(ang) * rr, t * ph, cz + Math.sin(ang) * rr, 0, b * (0.45 + rand() * 0.5), 0.6); }
    for (let ang = 0; ang < Math.PI * 2; ang += 0.1) { put(cx + Math.cos(ang) * 0.56 * sc, ph, cz + Math.sin(ang) * 0.56 * sc, 0, b * 0.95, 0.7); put(cx + Math.cos(ang) * 0.42 * sc, 0.02, cz + Math.sin(ang) * 0.42 * sc, 0, b * 0.7, 0.62); }
    for (let y = ph; y < ph + 1.6 * sc; y += 0.07) put(cx + jit(0.06), y, cz + jit(0.06), 0, b * 0.65, 0.6);
    const leaves = 10 + Math.round(rand() * 3);
    for (let k = 0; k < leaves; k++) {
      const ang = (k / leaves) * Math.PI * 2 + rand() * 0.5;
      const dirx = Math.cos(ang), dirz = Math.sin(ang);
      const baseY = ph + (0.5 + rand() * 1.4) * sc;
      const reach = (0.9 + rand() * 0.7) * sc;
      const tiltUp = 0.35 + rand() * 0.4;
      const la = reach * 0.5, lb = (0.3 + rand() * 0.12) * sc;
      const c0 = [cx + dirx * (0.25 * sc + la), baseY + tiltUp * la, cz + dirz * (0.25 * sc + la)];
      const ux = dirx, uy = tiltUp, uz = dirz;
      const ul = Math.hypot(ux, uy, uz);
      const vx = -dirz, vz = dirx;
      for (let i = 0; i < n(120); i++) {
        const th = rand() * Math.PI * 2;
        const rr = Math.sqrt(rand());
        const s = Math.cos(th) * rr * la, t = Math.sin(th) * rr * lb;
        const droop = -0.25 * sc * Math.max(0, s / la) * Math.max(0, s / la);
        put(c0[0] + (ux / ul) * s + vx * t, c0[1] + (uy / ul) * s + droop, c0[2] + (uz / ul) * s + vz * t, 0, b * (0.45 + rand() * 0.55), 0.62);
      }
      for (let t = -1; t <= 1; t += 0.1) put(c0[0] + (ux / ul) * t * la, c0[1] + (uy / ul) * t * la - 0.25 * sc * Math.max(0, t) * Math.max(0, t), c0[2] + (uz / ul) * t * la, 0, b * 0.9, 0.66);
    }
    occ.push({ k: "cyl", x: cx, y: 0, z: cz, r: 0.4 * sc, h: ph - 0.05 });
  };

  const rigs = new Map<string, Rig>();
  const human = (cx: number, cz: number, baseY: number, sc: number, b: number, pose: "seated" | "stand", yaw: number, dens: number, ci = 0, intro?: { name: string; role: string }) => {
    const H = 2.6 * sc;
    const key = `${sc}:${dens}`;
    let rig = rigs.get(key);
    if (!rig) { rig = makeRig(H, dens * fm, rand); rigs.set(key, rig); }
    const c = PAL[ci];
    const k = ci === 0 ? 0 : 0.8;
    const cr = lerp(1, c[0], k), cg = lerp(1, c[1], k), cb = lerp(1, c[2], k);
    evalRig(rig, poseJoints(H, pose), yaw, cx, baseY, cz, (x, y, z, bm) => putRGB(x, y, z, cr * b * bm, cg * b * bm, cb * b * bm, 0.78));
    occ.push(...humanOccluders(cx, cz, baseY, H, pose, yaw));
    if (intro) people.push({ x: cx, y: baseY + (pose === "seated" ? 0.47 : 0.95) * H, z: cz, ...intro });
  };

  /* ---- composition ------------------------------------------------------- */
  {
    const cx = -13.5, cz = -1.5, b = 1.0, dens = 1.5;
    bigTable(cx, cz, 11.5, 2.2, b, dens);
    chair(cx - 6.6, cz, Math.PI / 2, b, dens);
    human(cx - 6.6, cz - 0.05, 1.08, 0.92, b, "seated", -Math.PI / 2, dens, 0, { name: "Ayush", role: "I build the UI — every screen you'll click in Arcade." });
    monitor(cx - 4.9, cz - 0.05, -Math.PI / 2, b, dens);
    chair(cx - 0.6, cz + 1.5, Math.PI, b, dens);
    human(cx - 0.6, cz + 1.35, 1.08, 0.92, b, "seated", Math.PI, dens, 3, { name: "Harsh", role: "I design the multi-agent architecture that runs the loop." });
    monitor(cx - 0.6, cz - 0.55, 0, b, dens);
    chair(cx + 3.6, cz - 1.7, 0.4, b * 0.9, dens);
  }
  plant(-9.5, -9.5, 1.2, 0.8, 1.2);
  {
    const cx = -11, cz = -21, b = 0.7, dens = 1.0;
    bigTable(cx, cz, 8, 2.2, b, dens);
    chair(cx - 1.5, cz + 1.5, Math.PI, b, dens); human(cx - 1.5, cz + 1.35, 1.08, 0.9, b, "seated", Math.PI, dens, 4, { name: "Mapper", role: "I read the whole codebase and draw the attack surface." });
    chair(cx + 1.8, cz - 1.5, 0, b, dens); human(cx + 1.8, cz - 1.35, 1.08, 0.9, b, "seated", 0, dens, 0, { name: "Defender", role: "I trace the root cause and rank the fixes." });
    monitor(cx - 1.4, cz - 0.5, 0, b, dens); monitor(cx + 1.8, cz + 0.5, Math.PI, b, dens);
    plant(cx + 5.6, cz + 0.3, 1.3, b, dens);
  }
  {
    const cx = 11.5, cz = -12, b = 0.85, dens = 1.3;
    bigTable(cx, cz, 8.5, 2.3, b, dens);
    laptop(LAP.x, LAP.y, LAP.z, LAP.yaw, 1.0, 2.6);
    monitor(cx - 0.6, cz - 0.35, 0, b, dens);
    monitor(cx + 1.4, cz - 0.35, 0, b, dens);
    chair(cx + 0.4, cz - 1.55, 0, b, dens); human(cx + 0.4, cz - 1.4, 1.08, 0.9, b, "seated", 0, dens, 2, { name: "Daksh", role: "I own security — I make sure the exploit really is dead." });
    chair(cx + 4.9, cz, -Math.PI / 2, b, dens); human(cx + 4.9, cz + 0.05, 1.08, 0.9, b, "seated", Math.PI / 2, dens, 1, { name: "Attacker", role: "I break the app in a sandbox and keep the evidence." });
    chair(cx - 1.2, cz + 1.6, Math.PI, b * 0.9, dens);
    plant(cx + 7.2, cz + 0.4, 1.6, b, dens);
  }
  plant(19, -3, 1.5, 0.9, 1.3);
  {
    bigTable(-5, -40, 7.6, 2.2, 0.45, 0.6); chair(-6.5, -38.5, Math.PI, 0.45, 0.6); human(-6.5, -38.65, 1.08, 0.9, 0.45, "seated", Math.PI, 0.6, 4, { name: "Remediator", role: "I write the fix and the test that replays the attack." }); monitor(-6, -40.4, 0, 0.45, 0.6); plant(-0.5, -40, 1.2, 0.42, 0.6);
    bigTable(9, -44, 7.6, 2.2, 0.4, 0.6); chair(10.5, -45.6, 0, 0.4, 0.6); human(10.5, -45.45, 1.08, 0.9, 0.4, "seated", 0, 0.6, 3, { name: "Verifier", role: "I re-run the original attack. If it still works, nothing ships." }); plant(14, -43, 1.2, 0.38, 0.6);
    bigTable(-12, -60, 7.6, 2.2, 0.3, 0.5); plant(-7, -60, 1.1, 0.28, 0.5);
    human(3, -54, 0, 1.0, 0.32, "stand", Math.PI * 0.8, 0.6, 5);
  }

  for (let i = 0; i < Math.round(24000 * dm); i++) put(-R + rand() * 2 * R, rand() * (WALL_H + VAULT_H), Z_FRONT - rand() * LEN, 0, 0.03 + rand() * 0.06, 0.55);

  return { a, occ, people };
}

function toGeometry(a: Arr) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(a.pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(a.col, 3));
  g.setAttribute("aSize", new THREE.Float32BufferAttribute(a.size, 1));
  g.setAttribute("aPhase", new THREE.Float32BufferAttribute(a.phase, 1));
  return g;
}

function buildOccluders(occ: Occ[]): THREE.Group {
  const grp = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ colorWrite: false });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
  const sph = new THREE.SphereGeometry(1, 12, 8);
  for (const o of occ) {
    let mesh: THREE.Mesh;
    if (o.k === "box") {
      mesh = new THREE.Mesh(box, m);
      mesh.position.set(o.x, o.y, o.z);
      mesh.scale.set(o.w, o.h, o.d);
      mesh.rotation.order = "YXZ";
      mesh.rotation.set(o.rx ?? 0, o.ry ?? 0, 0);
    } else if (o.k === "cyl") {
      mesh = new THREE.Mesh(cyl, m);
      mesh.position.set(o.x, o.y + o.h / 2, o.z);
      mesh.scale.set(o.r, o.h, o.r);
    } else {
      mesh = new THREE.Mesh(sph, m);
      mesh.position.set(o.x, o.y, o.z);
      mesh.scale.setScalar(o.r);
    }
    mesh.renderOrder = -1;
    mesh.frustumCulled = false;
    grp.add(mesh);
  }
  return grp;
}

/* ---------------------------------------------------------- walkers */
function makeWalker(dm: number, ci: number, from: [number, number], to: [number, number], speed: number, phase0: number, seed: number, bright: number, side: number) {
  const rand = rngFn(seed);
  const H = 2.6;
  const rig = makeRig(H, 1.3 * dm * DETAIL, rand);
  const n = rig.samples.length;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  const c = PAL[ci];
  const k = ci === 0 ? 0 : 0.85;
  for (let i = 0; i < n; i++) {
    const bm = rig.segs[rig.samples[i].seg].bm * bright;
    col[i * 3] = lerp(1, c[0], k) * bm; col[i * 3 + 1] = lerp(1, c[1], k) * bm; col[i * 3 + 2] = lerp(1, c[2], k) * bm;
    size[i] = 0.82;
    phase[i] = rand() * Math.PI * 2;
  }
  const g = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute("position", posAttr);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  const yaw = Math.atan2(ux, uz);
  const px = -uz * side, pz = ux * side;
  const occMat = new THREE.MeshBasicMaterial({ colorWrite: false });
  const body = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.085 * H, 0.085 * H, 0.48 * H, 10), occMat);
  legs.position.y = 0.02 * H + 0.24 * H;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * H, 0.1 * H, 0.36 * H, 10), occMat);
  torso.position.y = 0.5 * H + 0.18 * H;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.07 * H, 10, 8), occMat);
  head.position.y = 0.95 * H;
  body.add(legs, torso, head);
  body.renderOrder = -1;
  const pauseLen = speed * 2.4;
  const cycle = len + pauseLen;
  const update = (t: number) => {
    const tt = t + phase0;
    const d = (tt * speed) % cycle;
    const walking = d >= pauseLen;
    const dd = walking ? d - pauseLen : 0;
    const x = from[0] + ux * dd + px, z = from[1] + uz * dd + pz;
    const joints = poseJoints(H, walking ? "walk" : "stand", tt * speed * 2.6);
    let i = 0;
    evalRig(rig, joints, yaw, x, 0, z, (ax, ay, az) => { pos[i++] = ax; pos[i++] = ay; pos[i++] = az; });
    posAttr.needsUpdate = true;
    body.position.set(x, 0, z);
  };
  return { geometry: g, update, body };
}

/* ------------------------------------------------------------ component */
export default function IntroScene() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipNameRef = useRef<HTMLDivElement>(null);
  const tipRoleRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const page = pageRef.current;
    if (!canvas || !wrap || !page) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dm = window.innerWidth > 820 ? 1 : 0.5;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "high-performance" });
    } catch {
      return;
    }
    renderer.setClearColor(0x000000, 0);
    const dprCap = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dprCap);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 220);
    const mat = new THREE.RawShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixel: { value: dprCap }, uFade: { value: 1 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const built = buildScene(dm);
    scene.add(buildOccluders(built.occ));
    const staticPts = new THREE.Points(toGeometry(built.a), mat);
    staticPts.frustumCulled = false;
    scene.add(staticPts);

    const walkers = [
      makeWalker(dm, 1, [17.2, -10.4], [-2.5, 6.5], 1.3, 0, 4242, 0.95, 0.95),
      makeWalker(dm, 0, [17.2, -10.4], [-2.5, 6.5], 1.3, 0.35, 7777, 0.85, -0.95),
    ];
    for (const w of walkers) {
      const p = new THREE.Points(w.geometry, mat);
      p.frustumCulled = false;
      scene.add(p);
      scene.add(w.body);
    }

    let vw = 1, vh = 1;
    function resize() {
      vw = window.innerWidth; vh = window.innerHeight;
      renderer.setSize(vw, vh, false);
      camera.aspect = vw / vh;
      camera.updateProjectionMatrix();
      page!.style.width = `${vw}px`;
      page!.style.height = `${vh}px`;
    }
    resize();
    window.addEventListener("resize", resize);

    // hover intros
    const mouse = { x: -1, y: -1, inside: false };
    const onMove = (e: MouseEvent) => {
      const r = canvas!.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.inside = true;
    };
    const onLeave = () => { mouse.inside = false; };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    const proj = new THREE.Vector3();
    let hovered: Person | null = null;
    function updateHover() {
      let best: Person | null = null;
      let bestD = Infinity;
      let bestPx = 0, bestPy = 0;
      if (mouse.inside) {
        for (const p of built.people) {
          proj.set(p.x, p.y, p.z).project(camera);
          if (proj.z > 1) continue;
          const sx = (proj.x * 0.5 + 0.5) * vw, sy = (-proj.y * 0.5 + 0.5) * vh;
          const dist = camera.position.distanceTo(new THREE.Vector3(p.x, p.y, p.z));
          const thresh = 16 + 520 / Math.max(dist, 2);
          const d = Math.hypot(sx - mouse.x, sy - (mouse.y - 20));
          if (d < thresh && d < bestD) { best = p; bestD = d; bestPx = sx; bestPy = sy; }
        }
      }
      const tip = tipRef.current;
      if (!tip) return;
      if (best) {
        if (best !== hovered) {
          hovered = best;
          if (tipNameRef.current) tipNameRef.current.textContent = `I'm ${best.name}.`;
          if (tipRoleRef.current) tipRoleRef.current.textContent = best.role;
        }
        tip.style.opacity = "1";
        tip.style.transform = `translate(${Math.round(bestPx)}px, ${Math.round(bestPy - 18)}px) translate(-50%, -100%)`;
        canvas!.style.cursor = "pointer";
      } else {
        hovered = null;
        tip.style.opacity = "0";
        canvas!.style.cursor = "";
      }
    }

    // ---- camera path: aerial → around to the laptop's LEFT → around to its FRONT
    const f = new THREE.Vector3(Math.sin(LAP.yaw), 0, Math.cos(LAP.yaw)); // screen facing direction
    const rgt = new THREE.Vector3(Math.cos(LAP.yaw), 0, -Math.sin(LAP.yaw));
    const sc = laptopScreenPoint(0, 0.5);
    const center = new THREE.Vector3(sc[0], sc[1], sc[2]);
    const P0 = new THREE.Vector3(0, 4.8, 13);
    const L0 = new THREE.Vector3(0, 3.4, -42);
    const P1 = center.clone().addScaledVector(f, 2.7).addScaledVector(rgt, -2.6).add(new THREE.Vector3(0, 0.95, 0));
    const L1 = center.clone();
    // final: straight down the screen's normal, close enough that the screen's
    // height equals the viewport's (fov 30 → d ≈ 1.0), so the laptop itself
    // grows with the window until its screen fills it
    const cyw = Math.cos(LAP.yaw), syw = Math.sin(LAP.yaw);
    const nl = new THREE.Vector3(0, Math.cos(LAPTOP.tilt), Math.sin(LAPTOP.tilt)); // screen normal (local)
    const n = new THREE.Vector3(nl.x * cyw + nl.z * syw, nl.y, -nl.x * syw + nl.z * cyw);
    const P2 = center.clone().addScaledVector(n, 0.98);
    const L2 = center.clone();
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();

    // laptop screen corners in world (TL, TR, BL, BR as seen from the front)
    const corners = [laptopScreenPoint(-0.415, 0.94), laptopScreenPoint(0.415, 0.94), laptopScreenPoint(-0.415, 0.06), laptopScreenPoint(0.415, 0.06)].map((c) => new THREE.Vector3(c[0], c[1], c[2]));
    const cp = new THREE.Vector3();

    function updatePage(p: number) {
      // the page fades in on the screen as we come around to the front; it stays
      // pinned to the screen's real corners while the dolly makes the laptop grow,
      // and only "pops out" to the exact viewport at the very end
      const show = ramp(p, 0.58, 0.7);
      const grow = easeInOut(ramp(p, 0.955, 1.0));
      if (show <= 0) { page!.style.opacity = "0"; return; }
      const pts: number[][] = [];
      for (const c of corners) {
        cp.copy(c).project(camera);
        if (cp.z > 1) { page!.style.opacity = "0"; return; }
        pts.push([(cp.x * 0.5 + 0.5) * vw, (-cp.y * 0.5 + 0.5) * vh]);
      }
      const full = [[0, 0], [vw, 0], [0, vh], [vw, vh]];
      const dst = pts.map((q, i) => [lerp(q[0], full[i][0], grow), lerp(q[1], full[i][1], grow)]);
      page!.style.opacity = String(show);
      page!.style.transform = matrix3dFor(vw, vh, dst);
    }

    const progress = { p: 0 };
    const t0 = performance.now();
    const elapsed = () => (performance.now() - t0) / 1000;
    function frame() {
      const p = progress.p;
      const t = elapsed();
      if (p < 0.5) {
        const e = easeInOut(p / 0.5);
        pos.lerpVectors(P0, P1, e);
        look.lerpVectors(L0, L1, e);
        camera.fov = lerp(64, 50, e);
      } else {
        const e = easeInOut(clamp((p - 0.5) / 0.455));
        pos.lerpVectors(P1, P2, e);
        look.lerpVectors(L1, L2, e);
        camera.fov = lerp(50, 30, e);
      }
      // no idle sway: the camera only moves with scroll, so the cloud holds still
      camera.position.copy(pos);
      camera.lookAt(look);
      camera.updateProjectionMatrix();
      mat.uniforms.uTime.value = t;
      mat.uniforms.uFade.value = 1 - 0.7 * ramp(p, 0.9, 1.0);
      for (const w of walkers) w.update(t);
      renderer.render(scene, camera);
      updateHover();
      updatePage(p);
    }

    let raf = 0, running = false;
    const loop = () => { frame(); raf = requestAnimationFrame(loop); };
    const start = () => { if (!running) { running = true; raf = requestAnimationFrame(loop); } };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    if (reduce) {
      progress.p = 0.02;
      frame();
      return () => {
        window.removeEventListener("resize", resize);
        canvas.removeEventListener("mousemove", onMove);
        canvas.removeEventListener("mouseleave", onLeave);
        renderer.dispose();
      };
    }

    const st = ScrollTrigger.create({ trigger: wrap, start: "top top", end: "bottom bottom", scrub: true, onUpdate: (s) => { progress.p = s.progress; } });
    const io = new IntersectionObserver(([en]) => (en.isIntersecting ? start() : stop()), { threshold: 0 });
    io.observe(wrap);
    start();

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      stop();
      io.disconnect();
      st.kill();
      staticPts.geometry.dispose();
      for (const w of walkers) w.geometry.dispose();
      mat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <section ref={wrapRef} className="relative h-[340vh] bg-black max-md:h-[240vh]">
      <div className="sticky top-0 h-screen overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(92%_80%_at_50%_45%,transparent,rgba(0,0,0,0.25)_75%,#000_100%)]" />

        {/* The page inside the laptop screen: pinned to the screen's corners, then grows to fill the viewport. */}
        <div
          ref={pageRef}
          className="pointer-events-none absolute left-0 top-0 overflow-hidden bg-black text-center text-white"
          style={{ opacity: 0, transformOrigin: "0 0", willChange: "transform, opacity", backfaceVisibility: "hidden" }}
          aria-hidden
        >
          <div className="relative flex h-full items-center justify-center px-[7%]">
            <div className="grid w-full max-w-[1320px] grid-cols-1 items-center gap-12 text-left md:grid-cols-[1.15fr_0.85fr]">
              {/* the attacker takes a penalty */}
              <div className="w-full max-w-[760px]">
                <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
                  <Image src="/penalty.jpg" alt="" width={1200} height={630} priority className="block h-auto w-full" />
                </div>
                <p className="h-display mt-7 text-[30px] font-medium leading-[1.15] text-white md:text-[40px]">
                  We attack your system to make it secure.
                </p>
              </div>
              {/* product card */}
              <div className="w-[340px] justify-self-center rounded-2xl bg-[linear-gradient(160deg,#1d5a43,#143c2e)] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-white/15 px-2 py-1 text-[11px] font-semibold tracking-wide text-white">AR</span>
                  <span className="flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[12px] text-white/85">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Active
                  </span>
                </div>
                <div className="mt-6 text-[22px] font-medium text-white">Attacker</div>
                <div className="mt-6 flex items-start gap-3 rounded-xl bg-white/[0.12] px-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-black/35 text-[11px] font-semibold text-white">VF</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold text-white">Verifier</span>
                    <span className="block truncate text-[12.5px] text-white/85">Re-running the original attack against the…</span>
                  </span>
                  <span className="text-[11px] text-white/60">now</span>
                </div>
                <div className="mt-3 h-px bg-white/15" />
                <div className="mt-3 flex items-center justify-between">
                  <span className="flex -space-x-2">
                    <span className="grid h-8 w-8 place-items-center rounded-md bg-black/35 text-[11px] font-semibold text-white ring-2 ring-[#173f31]">MP</span>
                    <span className="grid h-8 w-8 place-items-center rounded-md bg-black/35 text-[11px] font-semibold text-white ring-2 ring-[#173f31]">DF</span>
                  </span>
                  <span className="text-[11px] text-white/60">now</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* hover intro card */}
        <div
          ref={tipRef}
          className="pointer-events-none absolute left-0 top-0 max-w-[260px] rounded-lg border border-white/15 bg-black/85 px-3.5 py-2.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.9)] backdrop-blur transition-opacity duration-150"
          style={{ opacity: 0 }}
        >
          <div ref={tipNameRef} className="text-[13px] font-semibold text-white" />
          <div ref={tipRoleRef} className="mt-0.5 text-[12px] leading-5 text-white/65" />
        </div>
      </div>
    </section>
  );
}
