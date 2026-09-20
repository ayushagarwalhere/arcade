"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Preloader: a mini arcade cabinet built out of dots.
 *
 *  1. dots fly in and assemble the machine — the screen sits in attract mode
 *     ("ARCADE" / blinking "INSERT COIN")
 *  2. a coin is tossed in from the right and pushed into the slot
 *  3. the screen flashes on and a tiny platformer plays (the joystick and
 *     buttons react to the jumps)
 *  4. everything splashes outward and the overlay fades to reveal the hall
 */

const T_IN = 0.7; // assemble
const T_COIN = 0.95; // coin starts its toss (cabinet fully assembled by then)
const T_FALL = 0.45;
const T_PUSH = 0.2; // coin pushed into the slot
const T_ON = T_COIN + T_FALL + T_PUSH - 0.05; // screen flashes on
const T_FLASH = 0.15;
const T_GAME = T_ON + T_FLASH;
const GAME_LEN = 1.85;
const T_END = T_GAME + GAME_LEN; // splash begins
const T_OUT = 0.55;
const T_FADE = 0.45;

/* cabinet raster (logical px) */
const W0 = 142;
const H0 = 160;
const SCR = { x: 30, y: 33, w: 64, h: 48 };
const SLOT = { x: 62, y: 127 };
const STICK = { x: 34, y: 94 };
const BTNS: [number, number][] = [
  [70, 103],
  [88, 103],
];

type RGB = [number, number, number];
type Dot = { x: number; y: number; sx: number; sy: number; dx: number; dy: number; dl: number };
type Group = { css: string; dots: Dot[] };

const TAU = Math.PI * 2;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 4);
const easeInCubic = (t: number) => t * t * t;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;

/* ------------------------------------------------------------ 3x5 pixel font */

const FONT: Record<string, string[]> = {
  A: ["010", "101", "111", "101", "101"],
  C: ["111", "100", "100", "100", "111"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  I: ["111", "010", "010", "010", "111"],
  N: ["101", "111", "111", "101", "101"],
  O: ["111", "101", "101", "101", "111"],
  R: ["110", "101", "110", "101", "101"],
  S: ["111", "100", "111", "001", "111"],
  T: ["111", "010", "010", "010", "010"],
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
};

function drawText(put: (x: number, y: number) => void, s: string, x: number, y: number, sc = 1) {
  let cx = x;
  for (const ch of s) {
    const g = FONT[ch];
    if (g)
      for (let j = 0; j < 5; j++)
        for (let i = 0; i < 3; i++)
          if (g[j][i] === "1") for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) put(cx + i * sc + a, y + j * sc + b);
    cx += 4 * sc;
  }
}
const textW = (s: string, sc = 1) => s.length * 4 * sc - sc;

/* ------------------------------------------------------------ shapes */

function disc(r: number): [number, number][] {
  const out: [number, number][] = [];
  const n = Math.ceil(r);
  for (let y = -n; y <= n; y++) for (let x = -n; x <= n; x++) if (x * x + y * y <= r * r) out.push([x, y]);
  return out;
}
const BALL = disc(5.5);
const BTN = disc(5);
const COIN = disc(4.5);

/* the cabinet, rasterised once at 4x and sampled back to one dot per logical px */
function buildCabinet(): { x: number; y: number; c: RGB }[] {
  const R = 4;
  const off = document.createElement("canvas");
  off.width = W0 * R;
  off.height = H0 * R;
  const g = off.getContext("2d");
  if (!g) return [];
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x * R, y * R, w * R, h * R);
  };
  const poly = (pts: [number, number][], c: string) => {
    g.fillStyle = c;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * R, y * R) : g.moveTo(x * R, y * R)));
    g.closePath();
    g.fill();
  };
  const circ = (x: number, y: number, r: number, c: string) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(x * R, y * R, r * R, 0, TAU);
    g.fill();
  };
  const rrect = (x: number, y: number, w: number, h: number, r: number, c: string) => {
    const X = x * R, Y = y * R, W = w * R, H = h * R, rr = r * R;
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(X + rr, Y);
    g.arcTo(X + W, Y, X + W, Y + H, rr);
    g.arcTo(X + W, Y + H, X, Y + H, rr);
    g.arcTo(X, Y + H, X, Y, rr);
    g.arcTo(X, Y, X + W, Y, rr);
    g.closePath();
    g.fill();
  };

  const RED = "rgb(226,52,42)";
  const RED_SIDE = "rgb(150,36,28)";
  const RED_TOP = "rgb(184,42,34)";
  const BODY = "rgb(72,74,82)";
  const SIDE = "rgb(44,46,52)";
  const BEZEL = "rgb(50,52,58)";
  const PANEL = "rgb(88,90,98)";
  const DARK = "rgb(26,26,30)";

  // right side + top faces (oblique, going back up-right)
  poly([[110, 10], [128, 1], [128, 147], [110, 156]], SIDE);
  poly([[110, 10], [128, 1], [128, 21], [110, 30]], RED_SIDE);
  poly([[110, 150], [128, 141], [128, 147], [110, 156]], RED_SIDE);
  poly([[14, 10], [110, 10], [128, 1], [32, 1]], RED_TOP);

  // front face
  rrect(14, 10, 96, 146, 4, BODY);
  rrect(14, 10, 96, 20, 4, RED); // marquee
  rect(14, 22, 96, 8, RED);
  rect(22, 14, 80, 12, DARK); // marquee band
  drawText((x, y) => rect(x, y, 1, 1, "rgb(240,72,60)"), "ARCADE", 62 - textW("ARCADE", 2) / 2, 15, 2);
  rect(14, 30, 96, 54, BEZEL); // screen bezel
  rect(SCR.x, SCR.y, SCR.w, SCR.h, "rgb(255,0,255)"); // screen marker (live cells)
  rect(14, 84, 96, 28, PANEL); // control panel
  rect(14, 84, 96, 1, RED);
  circ(STICK.x, 105, 4, DARK); // joystick base
  rect(STICK.x - 1, 94, 2, 11, "rgb(40,40,46)"); // stick
  [66, 76, 86].forEach((x) => circ(x, 92, 1.8, "rgb(200,40,36)")); // small buttons
  rrect(50, 118, 24, 26, 3, RED); // coin plate
  rect(61, 122, 2, 9, DARK); // slot
  drawText((x, y) => rect(x, y, 1, 1, DARK), "COIN", 62 - textW("COIN") / 2, 135, 1);
  rect(14, 150, 96, 6, RED); // base
  rect(14, 10, 2, 146, RED); // red edge trims
  rect(108, 10, 2, 146, RED);

  const data = g.getImageData(0, 0, W0 * R, H0 * R).data;
  const out: { x: number; y: number; c: RGB }[] = [];
  for (let y = 0; y < H0; y++)
    for (let x = 0; x < W0; x++) {
      const i = ((y * R + 2) * W0 * R + (x * R + 2)) * 4;
      if (data[i + 3] < 128) continue;
      const r = data[i], gg = data[i + 1], b = data[i + 2];
      if (r > 240 && gg < 20 && b > 240) continue; // screen cell
      // quantise so anti-aliased edge pixels don't become hundreds of one-dot groups
      out.push({ x, y, c: [r & ~7, gg & ~7, b & ~7] });
    }
  return out;
}

/* ------------------------------------------------------------ the game on the screen */

const SW = SCR.w;
const SH = SCR.h;
const GROUND = SH - 8; // first ground row
const V = 40; // scroll speed, cells / s
const JUMP_LEN = 0.5;
const ENEMY_X = [36, 66, 96, 126, 156]; // world x of each obstacle
const RUN_A = [".HHH.", ".FFF.", ".BBB.", "BBBBB", ".BBB.", ".L.L.", ".L.L."];
const RUN_B = [".HHH.", ".FFF.", ".BBB.", ".BBB.", ".BBB.", "..LL.", ".L..L"];
const JUMP = [".HHH.", ".FFF.", "BBBBB", ".BBB.", ".BBB.", ".L.L.", "L...L"];
const HERO_PAL: Record<string, RGB> = { H: [230, 60, 50], F: [250, 214, 180], B: [56, 200, 140], L: [30, 36, 70] };
const ENEMY = [".PP.", "PPPP", "PWPW", ".P.P"];
const ENEMY_PAL: Record<string, RGB> = { P: [150, 70, 190], W: [255, 255, 255] };
const COIN_SPR = [".1.", "111", ".1."];
const COIN_PAL: Record<string, RGB> = { "1": [252, 210, 76] };
const CLOUD = ["..111..", ".11111.", "1111111"];
const CLOUD_PAL: Record<string, RGB> = { "1": [246, 248, 255] };
const CLOUDS: [number, number][] = [[10, 6], [45, 12], [80, 4], [120, 9]];

export default function Preloader() {
  const [done, setDone] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    /* layout */
    const S = Math.min((vh * 0.8) / H0, (vw * 0.8) / W0); // px per logical unit
    const R = S * 0.42; // dot radius
    const ox = (vw - W0 * S) / 2;
    const oy = (vh - H0 * S) / 2;
    const px = (x: number) => ox + (x + 0.5) * S;
    const py = (y: number) => oy + (y + 0.5) * S;
    const cx = vw / 2;
    const cy = vh / 2;
    const far = Math.max(vw, vh) * 0.75;
    const splashR = Math.max(vw, vh) * 0.9;

    const makeDot = (x: number, y: number): Dot => {
      const a0 = Math.random() * TAU;
      const ang = Math.atan2(py(y) - cy, px(x) - cx) + (Math.random() - 0.5) * 0.9;
      const m = 0.6 + Math.random() * 0.8;
      return {
        x,
        y,
        sx: cx + Math.cos(a0) * far,
        sy: cy + Math.sin(a0) * far,
        dx: Math.cos(ang) * m,
        dy: Math.sin(ang) * m,
        dl: Math.random() * 0.2,
      };
    };

    /* static cabinet dots, grouped by colour so each group is one fill */
    const groups: Group[] = [];
    const byColor = new Map<string, Group>();
    for (const d of buildCabinet()) {
      const key = css(d.c);
      let grp = byColor.get(key);
      if (!grp) {
        grp = { css: key, dots: [] };
        byColor.set(key, grp);
        groups.push(grp);
      }
      grp.dots.push(makeDot(d.x, d.y));
    }

    /* screen cells (live colours) */
    const cells: Dot[] = [];
    for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) cells.push(makeDot(SCR.x + i, SCR.y + j));
    const fb = new Uint8ClampedArray(SW * SH * 3);
    const set = (x: number, y: number, c: RGB) => {
      if (x < 0 || y < 0 || x >= SW || y >= SH) return;
      const i = (y * SW + x) * 3;
      fb[i] = c[0];
      fb[i + 1] = c[1];
      fb[i + 2] = c[2];
    };
    const fill = (c: RGB) => {
      for (let i = 0; i < SW * SH; i++) {
        fb[i * 3] = c[0];
        fb[i * 3 + 1] = c[1];
        fb[i * 3 + 2] = c[2];
      }
    };
    const sprite = (rows: string[], x: number, y: number, pal: Record<string, RGB>) => {
      for (let j = 0; j < rows.length; j++)
        for (let i = 0; i < rows[j].length; i++) {
          const c = pal[rows[j][i]];
          if (c) set(x + i, y + j, c);
        }
    };

    const attract = (t: number) => {
      fill([24, 28, 40]);
      drawText((x, y) => set(x, y, [240, 72, 60]), "ARCADE", Math.floor((SW - textW("ARCADE", 2)) / 2), 12, 2);
      if (Math.floor(t * 2.5) % 2 === 0)
        drawText((x, y) => set(x, y, [235, 235, 240]), "INSERT COIN", Math.floor((SW - textW("INSERT COIN")) / 2), 30, 1);
    };

    // game state read by the cabinet (joystick / buttons)
    let jumpU = -1; // 0..1 while the hero is in the air
    const game = (tg: number) => {
      const sc = tg * V;
      for (let y = 0; y < SH; y++) {
        const c: RGB = y < GROUND - 16 ? [78, 138, 226] : [100, 166, 238];
        for (let x = 0; x < SW; x++) set(x, y, c);
      }
      // mountains (parallax)
      const ms = sc * 0.4;
      for (let x = 0; x < SW; x++) {
        const wx = x + ms;
        const h = 3 + 4 * Math.abs(Math.sin(wx * 0.09)) + 2 * Math.abs(Math.sin(wx * 0.23 + 1));
        for (let y = GROUND - Math.round(h); y < GROUND; y++) set(x, y, [76, 96, 176]);
      }
      // clouds
      const cs = sc * 0.25;
      for (const [wx, wy] of CLOUDS) {
        const period = 140;
        const x = ((((wx - cs) % period) + period) % period) - 10;
        sprite(CLOUD, Math.round(x), wy, CLOUD_PAL);
      }
      // ground: grass + bricks
      for (let x = 0; x < SW; x++) {
        set(x, GROUND, [96, 190, 70]);
        set(x, GROUND + 1, [60, 150, 50]);
        const wx = Math.floor(x + sc);
        for (let y = GROUND + 2; y < SH; y++) {
          const row = y - GROUND - 2;
          const brickRow = Math.floor(row / 3);
          const mortar = row % 3 === 2 || (wx + (brickRow % 2) * 4) % 8 === 7;
          set(x, y, mortar ? [140, 64, 28] : [198, 102, 48]);
        }
      }
      // obstacles + coins; the hero jumps each one and grabs the coin above it
      jumpU = -1;
      let score = 0;
      for (const wx of ENEMY_X) {
        const tj = (wx - 21) / V;
        const u = (tg - tj) / JUMP_LEN;
        if (u >= 0 && u <= 1) jumpU = u;
        const ex = Math.round(wx - sc);
        if (ex > -5 && ex < SW) sprite(ENEMY, ex, GROUND - 4, ENEMY_PAL);
        const got = tg > tj + 0.26;
        if (got) score += 10;
        else if (ex + 4 > -4 && ex + 4 < SW) sprite(COIN_SPR, ex + 4, GROUND - 12, COIN_PAL);
      }
      const yoff = jumpU >= 0 ? -Math.round(32 * jumpU * (1 - jumpU)) : 0;
      const frame = jumpU >= 0 ? JUMP : Math.floor(tg * 10) % 2 ? RUN_A : RUN_B;
      sprite(frame, 12, GROUND - 7 + yoff, HERO_PAL);
      drawText((x, y) => set(x, y, [255, 255, 255]), String(score).padStart(4, "0"), 2, 2, 1);
    };

    const whiten = (a: number) => {
      for (let i = 0; i < fb.length; i++) fb[i] = fb[i] + (255 - fb[i]) * a;
    };

    let raf = 0;
    const t0 = performance.now();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      wrap.style.opacity = "0";
      window.setTimeout(() => {
        document.body.style.overflow = prevOverflow;
        setDone(true);
      }, T_FADE * 1000);
    };

    if (reduce || groups.length === 0) {
      window.setTimeout(finish, 300);
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }

    // deterministic splash direction for the dynamic dots (ball, buttons, coin)
    const hash = (i: number) => {
      const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      return s - Math.floor(s);
    };
    const dyn = (x: number, y: number, i: number, out: number): [number, number] => {
      if (!out) return [x, y];
      const ang = Math.atan2(y - cy, x - cx) + (hash(i) - 0.5) * 0.9;
      const m = 0.6 + hash(i + 7) * 0.8;
      return [x + Math.cos(ang) * m * out * splashR, y + Math.sin(ang) * m * out * splashR];
    };
    const blob = (
      pts: [number, number][],
      x0: number,
      y0: number,
      color: (dx: number, dy: number) => string,
      out: number,
      k: number,
      scale = 1,
      seed = 0,
    ) => {
      let cur = "";
      for (let i = 0; i < pts.length; i++) {
        const [dx, dy] = pts[i];
        const c = color(dx, dy);
        if (c !== cur) {
          if (cur) ctx.fill();
          ctx.fillStyle = c;
          ctx.beginPath();
          cur = c;
        }
        const [x, y] = dyn(px(x0 + dx * scale), py(y0 + dy * scale), seed + i, out);
        const r = R * scale * (0.25 + 0.75 * k) * (1 - out * 0.6);
        if (r < 0.2) continue;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
      if (cur) ctx.fill();
    };

    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      if (t >= T_END + T_OUT) {
        finish();
        return;
      }
      ctx.clearRect(0, 0, vw, vh);
      const out = t >= T_END ? easeInCubic((t - T_END) / T_OUT) : 0;
      const kAll = easeOutCubic(clamp((t - 0.2) / T_IN));

      /* screen content */
      if (t < T_ON) attract(t);
      else if (t < T_GAME) {
        const u = (t - T_ON) / T_FLASH;
        if (u < 0.4) fill([255, 255, 255]);
        else {
          game(0);
          whiten((1 - u) / 0.6);
        }
      } else game(t - T_GAME);

      ctx.globalAlpha = 1 - out;

      /* cabinet */
      for (const grp of groups) {
        ctx.fillStyle = grp.css;
        ctx.beginPath();
        for (const d of grp.dots) {
          const k = easeOutCubic(clamp((t - d.dl) / T_IN));
          let x: number, y: number, r: number;
          if (out) {
            x = px(d.x) + d.dx * out * splashR;
            y = py(d.y) + d.dy * out * splashR;
            r = R * (1 - out * 0.6);
          } else {
            x = d.sx + (px(d.x) - d.sx) * k;
            y = d.sy + (py(d.y) - d.sy) * k;
            r = R * (0.25 + 0.75 * k);
          }
          if (r < 0.2) continue;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, TAU);
        }
        ctx.fill();
      }

      /* screen cells: batch runs of the same colour */
      let cur = "";
      for (let idx = 0; idx < cells.length; idx++) {
        const key = `rgb(${fb[idx * 3]},${fb[idx * 3 + 1]},${fb[idx * 3 + 2]})`;
        if (key !== cur) {
          if (cur) ctx.fill();
          ctx.fillStyle = key;
          ctx.beginPath();
          cur = key;
        }
        const d = cells[idx];
        const k = easeOutCubic(clamp((t - d.dl) / T_IN));
        let x: number, y: number, r: number;
        if (out) {
          x = px(d.x) + d.dx * out * splashR;
          y = py(d.y) + d.dy * out * splashR;
          r = R * 1.15 * (1 - out * 0.6);
        } else {
          x = d.sx + (px(d.x) - d.sx) * k;
          y = d.sy + (py(d.y) - d.sy) * k;
          r = R * 1.15 * (0.25 + 0.75 * k);
        }
        if (r < 0.2) continue;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
      if (cur) ctx.fill();

      /* joystick ball: leans forward while running, up on a jump */
      const playing = t >= T_GAME && !out;
      const bx = STICK.x + (playing ? 1.5 : 0);
      const by = STICK.y + (playing && jumpU >= 0 ? -1.5 : 0);
      blob(BALL, bx, by, (dx, dy) => (dx < -1 && dy < -1 ? "rgb(255,150,140)" : "rgb(236,58,48)"), out, kAll, 1, 1000);

      /* buttons: the first one lights up as each jump starts */
      BTNS.forEach(([x, y], i) => {
        const hit = playing && i === 0 && jumpU >= 0 && jumpU < 0.3;
        blob(BTN, x, y + (hit ? 0.6 : 0), () => (hit ? "rgb(255,130,120)" : "rgb(226,52,42)"), out, kAll, 1, 2000 + i * 100);
      });

      /* the coin: tossed in from the right in a falling arc, then pushed into the slot */
      if (!out && t >= T_COIN && t < T_COIN + T_FALL + T_PUSH + 0.35) {
        const u = (t - T_COIN) / T_FALL;
        const x0 = W0 + 14;
        const y0 = SLOT.y - 34;
        let xc = SLOT.x, yc = SLOT.y, sc = 1;
        if (u < 1) {
          const e = 1 - Math.pow(1 - u, 3);
          xc = x0 + (SLOT.x - x0) * e;
          yc = y0 + (SLOT.y - y0) * u * u;
        } else sc = 1 - 0.92 * clamp((t - T_COIN - T_FALL) / T_PUSH);
        if (sc > 0.1)
          blob(COIN, xc, yc, (dx, dy) => (dx * dx + dy * dy > 10.5 || (dx === 0 && Math.abs(dy) <= 1) ? "rgb(214,160,40)" : "rgb(252,210,76)"), 0, 1, sc, 3000);
        // sparks as it goes in
        if (u >= 1) {
          const v2 = clamp((t - T_COIN - T_FALL) / 0.35);
          ctx.fillStyle = `rgba(252,210,76,${(1 - v2).toFixed(3)})`;
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * TAU + 0.3;
            const dd = 3 + 9 * v2;
            const x = px(SLOT.x + Math.cos(ang) * dd);
            const y = py(SLOT.y + Math.sin(ang) * dd * 0.8);
            const r = R * (1 - v2 * 0.7);
            ctx.moveTo(x + r, y);
            ctx.arc(x, y, r, 0, TAU);
          }
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  if (done) return null;
  return (
    <div ref={wrapRef} className="fixed inset-0 z-100 bg-black transition-opacity duration-500 ease-out" aria-hidden>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
