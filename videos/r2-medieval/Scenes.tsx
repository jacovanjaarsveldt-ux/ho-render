import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, Easing } from "remotion";

// Explainer scenes = a PAINTED base illustration (Nano Banana 2.1, our matte ink-and-paint style, no text in the image)
// with coded animated layers on top: labels that slide in on leader lines, flowing heat/smoke arrows, flickering fire glow,
// drifting smoke, a slow camera drift and light parallax between the painting, the smoke layer and the label layer.
// All overlay coordinates are in the painting's 1600x894 space (scaled 1.2 to the 1920x1080 frame).

const FPS = 30;
const C = { gold: "#E7C27A", cream: "#F4EBD8", ink: "#1B120A", brown: "#3A2A1A", red: "#B3322B", orange: "#E0762B", blue: "#4F86C6", green: "#4E7A3A", mid: "#6B5235" };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const eo = Easing.out(Easing.cubic);
type S = { a: number; b: number; p?: Record<string, number> };

// camera: slow drift of the whole painted stack; layers get different strengths so they slide a little against each other
const Stage: React.FC<{ src: string; s: S; z0?: number; z1?: number; dx?: number; dy?: number; origin?: string; children: (k: { fr: number; t: number; layer: (m: number) => React.CSSProperties }) => React.ReactNode; tint?: string }> = ({ src, s, z0 = 1.0, z1 = 1.045, dx = -22, dy = -8, origin = "50% 50%", children, tint }) => {
  const fr = useCurrentFrame();
  const dur = Math.max(1, (s.b - s.a) * FPS);
  const t = interpolate(fr, [0, dur], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) });
  const zoom = z0 + (z1 - z0) * t;
  const layer = (m: number): React.CSSProperties => ({ position: "absolute", left: 0, top: 0, width: 1600, height: 894, transformOrigin: "0 0", transform: `scale(1.2) translate(${dx * t * m}px, ${dy * t * m}px)` });
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: C.ink }}>
      <div style={{ position: "absolute", inset: 0, transformOrigin: origin, transform: `scale(${zoom})` }}>
        <div style={layer(1)}><Img src={staticFile(src)} style={{ width: 1600, height: 894 }} /></div>
        {tint && <div style={{ ...layer(1), background: tint, mixBlendMode: "multiply" }} />}
        {children({ fr, t, layer })}
      </div>
    </AbsoluteFill>
  );
};

// fire glow that flickers (screen blend) at a point
const Glow: React.FC<{ x: number; y: number; r: number; fr: number; k?: number; c?: string }> = ({ x, y, r, fr, k = 1, c = "255,170,70" }) => {
  const f = 0.55 + 0.18 * Math.sin(fr / 3.1) + 0.1 * Math.sin(fr / 1.3 + 1) + 0.06 * Math.sin(fr / 0.8);
  return <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", mixBlendMode: "screen", opacity: Math.min(1, f * k), background: `radial-gradient(circle, rgba(${c},.85) 0%, rgba(${c},.35) 32%, rgba(${c},0) 70%)` }} />;
};

const bez = (p: number[][], u: number) => {
  const m = 1 - u;
  return [0, 1].map((k) => m * m * m * p[0][k] + 3 * m * m * u * p[1][k] + 3 * m * u * u * p[2][k] + u * u * u * p[3][k]);
};
// drifting smoke puffs along a curve (rises, grows, fades)
const Smoke: React.FC<{ path: number[][]; fr: number; n?: number; speed?: number; size?: number; show: number; tone?: string }> = ({ path, fr, n = 12, speed = 0.006, size = 26, show, tone = "150,146,138" }) => (
  <>{Array.from({ length: n }).map((_, i) => {
    const u = ((fr * speed + i / n) % 1);
    const [x, y] = bez(path, u);
    const sw = Math.sin(fr / 24 + i * 1.7) * 10 * u;
    const op = Math.sin(Math.PI * Math.min(1, u * 1.05)) * 0.5 * show;
    return <div key={i} style={{ position: "absolute", left: x + sw - size * (0.6 + u * 1.6), top: y - size * (0.6 + u * 1.6), width: size * (1.2 + u * 3.2), height: size * (1.2 + u * 3.2), borderRadius: "50%", background: `radial-gradient(circle, rgba(${tone},.7), rgba(${tone},0) 70%)`, opacity: op }} />;
  })}</>
);

// flowing dashed arrow along a cubic curve, with an arrow head at the end
const Flow: React.FC<{ path: number[][]; fr: number; c: string; at: number; t: number; w?: number; speed?: number; dash?: string }> = ({ path, fr, c, at, t, w = 9, speed = 2.2, dash = "26 18" }) => {
  const prog = interpolate(t, [at, at + 0.9], [0, 1], { ...clamp, easing: eo });
  if (prog <= 0) return null;
  const d = `M${path[0][0]},${path[0][1]} C${path[1][0]},${path[1][1]} ${path[2][0]},${path[2][1]} ${path[3][0]},${path[3][1]}`;
  const e = bez(path, 1), e2 = bez(path, 0.96); const ang = (Math.atan2(e[1] - e2[1], e[0] - e2[0]) * 180) / Math.PI;
  return (
    <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: prog }}>
      <path d={d} fill="none" stroke={c} strokeWidth={w + 12} strokeLinecap="round" opacity={0.18} />
      <path d={d} fill="none" stroke={C.ink} strokeWidth={w + 5} strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={-fr * speed} opacity={0.55} />
      <path d={d} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={-fr * speed} />
      <g transform={`translate(${e[0]},${e[1]}) rotate(${ang})`}><path d="M12,0 L-18,-17 L-18,17 Z" fill={c} stroke={C.ink} strokeWidth="4" strokeLinejoin="round" /></g>
    </svg>
  );
};

// label that slides in on a leader line to its target; t is seconds since the scene start
const Label: React.FC<{ x: number; y: number; tx?: number; ty?: number; text: string; at: number; t: number; color?: string; size?: number; from?: "left" | "right" | "up" | "down"; m?: number }> = ({ x, y, tx, ty, text, at, t, color = C.gold, size = 30, from = "up", m = 1 }) => {
  const p = interpolate(t, [at, at + 0.45], [0, 1], { ...clamp, easing: eo });
  if (p <= 0) return null;
  const off = (1 - p) * 70; const ox = from === "left" ? -off : from === "right" ? off : 0; const oy = from === "up" ? -off : from === "down" ? off : 0;
  const line = interpolate(t, [at + 0.2, at + 0.75], [0, 1], { ...clamp, easing: eo });
  return (
    <>
      {tx !== undefined && ty !== undefined && (
        <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          <line x1={x} y1={y} x2={x + (tx - x) * line} y2={y + (ty - y) * line} stroke={C.ink} strokeWidth="8" strokeLinecap="round" opacity={0.6} />
          <line x1={x} y1={y} x2={x + (tx - x) * line} y2={y + (ty - y) * line} stroke={color} strokeWidth="4" strokeLinecap="round" />
          <circle cx={tx} cy={ty} r={9 * line} fill={color} stroke={C.ink} strokeWidth="3" />
        </svg>
      )}
      <div style={{ position: "absolute", left: x + ox, top: y + oy, transform: "translate(-50%,-50%)", opacity: p, whiteSpace: "nowrap", padding: "7px 22px 6px", borderRadius: 6, background: "rgba(24,16,9,.9)", border: `3px solid ${color}`, boxShadow: "0 5px 14px rgba(0,0,0,.55)", fontFamily: "Archivo", fontWeight: 800, fontSize: size, letterSpacing: "0.06em", color: C.cream }}>{text}</div>
    </>
  );
};

// ---------- 1) ink-stamp question card on painted parchment ----------
export const QCard: React.FC<{ s: S }> = ({ s }) => {
  const lines = ["HOW DO YOU", "SURVIVE A WHOLE", "WINTER LIKE THIS?"];
  return (
    <Stage src="paint/q.jpg" s={s} z0={1.0} z1={1.03} dx={-10} dy={0}>
      {({ fr, t }) => {
        const d = s.b - s.a;
        const out = interpolate(t * d, [d - 0.45, d], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
        return (
          <div style={{ position: "absolute", left: 0, top: 0, width: 1600, height: 894, transform: `scale(1.2) translateX(${out * 1800}px)`, transformOrigin: "0 0" }}>
            {lines.map((l, k) => {
              const at = 0.2 + k * 0.8; const p = interpolate(t * d, [at, at + 0.16], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
              const since = t * d - at;
              return (
                <div key={k} style={{ position: "absolute", left: 0, width: 1600, top: 250 + k * 135, textAlign: "center" }}>
                  <div style={{ display: "inline-block", opacity: p, transform: `scale(${1.55 - 0.55 * p}) rotate(${(k - 1) * -1.2}deg)`, fontFamily: "Archivo", fontWeight: 800, fontSize: 118, letterSpacing: "0.015em", color: k === 2 ? C.red : C.brown, textShadow: "1px 2px 0 rgba(58,42,26,.35), 0 0 6px rgba(58,42,26,.35)" }}>{l}</div>
                  {since > 0 && since < 0.5 && <div style={{ position: "absolute", left: "50%", top: 70, width: 700 * (1 + since), height: 110, transform: "translate(-50%,-50%)", borderRadius: "50%", background: "radial-gradient(ellipse, rgba(58,42,26,.18), rgba(58,42,26,0) 70%)", opacity: 1 - since * 2 }} />}
                </div>
              );
            })}
          </div>
        );
      }}
    </Stage>
  );
};

// ---------- 2) longhouse cutaway ----------
export const Cutaway: React.FC<{ s: S }> = ({ s }) => {
  const P = { cross: 2.4, fam: 5.3, ship: 7.6, drain: 10.5, dung: 12.4, ...(s.p ?? {}) } as Record<string, number>;
  P.dung = Math.min(P.dung, s.b - s.a - 1.6);
  const smokePath = [[470, 520], [440, 420], [500, 330], [468, 215]];
  const smokeUp = [[468, 215], [440, 150], [500, 90], [470, 30]];
  return (
    <Stage src="paint/cut.jpg" s={s} z0={1.0} z1={1.05} dx={-30} dy={-6}>
      {({ fr, t, layer }) => {
        const tt = t * (s.b - s.a);
        const sm = interpolate(tt, [0.4, 1.8], [0, 1], clamp);
        return (
          <>
            <div style={layer(1.0)}><Glow x={480} y={540} r={240} fr={fr} k={1.0} /><Glow x={480} y={560} r={90} fr={fr + 7} k={0.9} c="255,210,120" /></div>
            <div style={layer(1.25)}>
              <Smoke path={smokeUp} fr={fr} n={10} speed={0.0045} size={24} show={sm} />
              <Flow path={smokePath} fr={fr} c="#C9C3B6" at={P.cross + 1.0} t={tt} w={8} />
              <Flow path={[[505, 215], [520, 170], [470, 120], [490, 70]]} fr={fr} c="#C9C3B6" at={P.cross + 1.6} t={tt} w={7} />
            </div>
            <div style={layer(1.6)}>
              <Label x={410} y={110} tx={468} ty={160} text="SMOKE LEAVES THROUGH THE THATCH" at={P.cross + 1.2} t={tt} from="left" size={26} color="#C9C3B6" />
              <Label x={330} y={745} tx={340} ty={620} text="FAMILY" at={P.fam} t={tt} color={C.blue} from="down" />
              <Label x={640} y={745} tx={790} ty={640} text="CROSS-PASSAGE" at={P.cross} t={tt} color={C.gold} from="down" />
              <Label x={1090} y={745} tx={1030} ty={600} text="SHIPPON (CATTLE)" at={P.ship} t={tt} color={C.red} from="down" />
              <Label x={1250} y={790} tx={1160} ty={668} text="DRAIN" at={P.drain} t={tt} color="#6FA3D8" from="down" />
              <Label x={1470} y={700} tx={1405} ty={578} text="DUNG HOLE" at={P.dung} t={tt} color={C.gold} from="down" />
            </div>
          </>
        );
      }}
    </Stage>
  );
};

// ---------- 3) heat figure: about 30 C on the front, about 6 C on the back ----------
export const Heat: React.FC<{ s: S }> = ({ s }) => {
  const P = { t30: 4.4, t6: 5.9, turn: 8.0, ...(s.p ?? {}) } as Record<string, number>;
  const warm = [[1120, 610], [1050, 540], [980, 540], [905, 500]];
  const warm2 = [[1130, 660], [1050, 650], [985, 610], [912, 585]];
  const cold = [[250, 470], [350, 440], [450, 470], [590, 450]];
  const cold2 = [[240, 560], [350, 540], [450, 560], [585, 540]];
  return (
    <Stage src="paint/heat.jpg" s={s} z0={1.0} z1={1.045} dx={-24} dy={-6}>
      {({ fr, t, layer }) => {
        const tt = t * (s.b - s.a);
        const front = interpolate(tt, [P.t30 - 0.5, P.t30 + 0.8], [0, 1], clamp);
        const back = interpolate(tt, [P.t6 - 0.5, P.t6 + 0.8], [0, 1], clamp);
        const turn = interpolate(tt, [P.turn, P.turn + 0.8], [0, 1], clamp);
        const pulseF = 0.7 + 0.3 * Math.sin(fr / 5);
        return (
          <>
            <div style={layer(1.0)}>
              <Glow x={1190} y={690} r={300} fr={fr} k={1.0} />
              <div style={{ position: "absolute", left: 640, top: 250, width: 420, height: 560, borderRadius: "50%", mixBlendMode: "screen", opacity: front * 0.5 * pulseF, background: "radial-gradient(ellipse at 85% 45%, rgba(255,140,50,.8), rgba(255,140,50,0) 62%)" }} />
              <div style={{ position: "absolute", left: 470, top: 230, width: 330, height: 600, borderRadius: "50%", mixBlendMode: "multiply", opacity: back * 0.85, background: "radial-gradient(ellipse at 40% 45%, rgba(40,90,190,.8), rgba(40,90,190,0) 66%)" }} />
              <div style={{ position: "absolute", left: 470, top: 230, width: 330, height: 600, borderRadius: "50%", mixBlendMode: "screen", opacity: back * 0.18, background: "radial-gradient(ellipse at 40% 45%, rgba(130,180,255,.9), rgba(130,180,255,0) 66%)" }} />
            </div>
            <div style={layer(1.3)}>
              <Smoke path={[[870, 360], [890, 320], [850, 270], [880, 230]]} fr={fr} n={5} speed={0.004} size={14} show={0.5} tone="190,200,215" />
              <Flow path={warm} fr={fr} c={C.orange} at={P.t30 - 0.6} t={tt} />
              <Flow path={warm2} fr={fr} c="#F1A04B" at={P.t30 - 0.3} t={tt} w={7} />
              <Flow path={cold} fr={fr} c="#7FAEE8" at={P.t6 - 0.6} t={tt} />
              <Flow path={cold2} fr={fr} c="#5B8FD0" at={P.t6 - 0.3} t={tt} w={7} />
              <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: turn }}>
                {/* the "turning like a chicken on a spit" arc around the seated figure */}
                <g transform={`translate(760,560)`}>
                  <ellipse rx={300} ry={120} fill="none" stroke={C.ink} strokeWidth="13" strokeDasharray="40 26" strokeDashoffset={-fr * 3} opacity={0.5} />
                  <ellipse rx={300} ry={120} fill="none" stroke={C.gold} strokeWidth="7" strokeDasharray="40 26" strokeDashoffset={-fr * 3} />
                </g>
              </svg>
            </div>
            <div style={layer(1.6)}>
              <Label x={1090} y={235} tx={870} ty={420} text="FRONT: ABOUT 30 °C" at={P.t30} t={tt} color={C.orange} from="right" size={34} />
              <Label x={350} y={235} tx={650} ty={430} text="BACK: ABOUT 6 °C" at={P.t6} t={tt} color={C.blue} from="left" size={34} />
              <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: interpolate(tt, [0.6, 1.4], [0, 1], clamp) }}>
                <path d="M935,745 H1130 M935,730 v30 M1130,730 v30" stroke={C.ink} strokeWidth="10" fill="none" strokeLinecap="round" opacity={0.6} />
                <path d="M935,745 H1130 M935,730 v30 M1130,730 v30" stroke={C.cream} strokeWidth="5" fill="none" strokeLinecap="round" />
              </svg>
              <Label x={1032} y={790} text="ABOUT 1 METRE FROM THE FIRE" at={0.9} t={tt} color={C.cream} from="up" size={26} />
              <Label x={780} y={705} text="TURNING LIKE A CHICKEN ON A SPIT" at={P.turn + 0.2} t={tt} color={C.gold} from="down" size={24} />
            </div>
          </>
        );
      }}
    </Stage>
  );
};

// ---------- 4) winter food countdown on a pinned parchment, grain barrel draining ----------
const MONTHS: [string, number][] = [["NOV", 30], ["DEC", 31], ["JAN", 31], ["FEB", 28], ["MAR", 31], ["APR", 30]];
const jit = (i: number, k: number) => Math.sin(i * 12.9898 + k * 78.233) * 0.5;
export const Calendar: React.FC<{ s: S }> = ({ s }) => {
  const P = { mart: 4.0, start: 6.0, end: 13.0, ...(s.p ?? {}) } as Record<string, number>;
  const STOP = 131;
  return (
    <Stage src="paint/cal.jpg" s={s} z0={1.0} z1={1.04} dx={-14} dy={-4}>
      {({ fr, t, layer }) => {
        const tt = t * (s.b - s.a);
        const end = Math.min(P.end, s.b - s.a - 2.6);
        const prog = interpolate(tt, [P.start, end], [10, STOP], { ...clamp, easing: Easing.inOut(Easing.quad) });
        const level = interpolate(tt, [P.start, end], [1, 0.07], clamp);
        const grid = interpolate(tt, [0.3, 1.2], [0, 1], clamp);
        const q = interpolate(tt, [end + 0.2, end + 0.9], [0, 1], clamp);
        let idx = 0;
        return (
          <>
            <div style={layer(1.0)}>
              <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: grid }}>
                {MONTHS.map(([name, days], m) => {
                  const bx = 360 + (m % 3) * 300, by = 190 + Math.floor(m / 3) * 300;
                  const cells = Array.from({ length: days }, (_, d) => {
                    const i = idx + d; const cx = bx + (d % 10) * 26 + jit(i, 1) * 2, cy = by + 52 + Math.floor(d / 10) * 26 + jit(i, 2) * 2;
                    const crossP = interpolate(prog, [i, i + 1], [0, 1], clamp); const on = i >= 10 && crossP > 0;
                    return (
                      <g key={d} transform={`rotate(${jit(i, 3) * 2.2} ${cx + 11} ${cy + 11})`}>
                        <rect x={cx} y={cy} width={22} height={22} rx={2} fill={i === 10 ? "#E2B45A" : "rgba(244,235,216,.35)"} stroke={C.brown} strokeWidth={2.4} strokeDasharray={i >= STOP ? "4 4" : undefined} />
                        {on && <path d={`M${cx + 3},${cy + 3} L${cx + 19},${cy + 19} M${cx + 19},${cy + 3} L${cx + 3},${cy + 19}`} stroke={C.red} strokeWidth="4.2" strokeLinecap="round" strokeDasharray="30" strokeDashoffset={30 * (1 - crossP)} />}
                      </g>
                    );
                  });
                  idx += days;
                  return <g key={name}><text x={bx} y={by + 34} fontFamily="Cinzel" fontWeight={900} fontSize="34" fill={C.brown}>{name}</text>{cells}</g>;
                })}
              </svg>
              <div style={{ position: "absolute", left: 330, top: 640, width: 620, textAlign: "center", fontFamily: "Archivo", fontWeight: 800, fontSize: 120, color: C.red, opacity: q, transform: `rotate(-4deg)` }}>?</div>
            </div>
            {/* grain barrel on the wood wall, painted-look gradients, level drops with the crosses */}
            <div style={layer(1.25)}>
              <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: grid }}>
                <defs>
                  <linearGradient id="stave" x1="0" x2="1"><stop offset="0" stopColor="#4B3420" /><stop offset="0.35" stopColor="#8A6238" /><stop offset="0.7" stopColor="#6B4A2A" /><stop offset="1" stopColor="#3A2814" /></linearGradient>
                  <linearGradient id="grain" x1="0" x2="1"><stop offset="0" stopColor="#B9852E" /><stop offset="0.5" stopColor="#E3B95A" /><stop offset="1" stopColor="#A77A2A" /></linearGradient>
                  <clipPath id="inside"><rect x={1352} y={382} width={152} height={380} rx={20} /></clipPath>
                </defs>
                <rect x={1338} y={360} width={180} height={420} rx={38} fill="url(#stave)" stroke={C.ink} strokeWidth="6" />
                <rect x={1352} y={382} width={152} height={380} rx={20} fill="#1B120A" opacity={0.9} />
                <rect x={1352} y={762 - 380 * level} width={152} height={380 * level + 2} fill="url(#grain)" clipPath="url(#inside)" />
                {[430, 560, 700].map((y) => <rect key={y} x={1334} y={y} width={188} height={14} rx={5} fill="#2B2D33" stroke={C.ink} strokeWidth="3" />)}
                <rect x={1338} y={360} width={180} height={420} rx={38} fill="none" stroke={C.ink} strokeWidth="6" />
              </svg>
            </div>
            <div style={layer(1.6)}>
              <Label x={1428} y={815} text="GRAIN" at={0.8} t={tt} color={C.gold} from="up" size={26} />
              <Label x={500} y={140} tx={462} ty={282} text="MARTINMAS: 11 NOVEMBER" at={P.mart} t={tt} color={C.red} from="up" size={28} />
            </div>
          </>
        );
      }}
    </Stage>
  );
};

// ---------- 5) night length bar laid over a painted dusk-to-dawn moor ----------
export const NightBar: React.FC<{ s: S }> = ({ s }) => {
  const P = { label: 3.2, ...(s.p ?? {}) } as Record<string, number>;
  return (
    <Stage src="paint/night.jpg" s={s} z0={1.0} z1={1.05} dx={-40} dy={-6} origin="30% 50%">
      {({ fr, t, layer }) => {
        const tt = t * (s.b - s.a);
        const X0 = 120, W = 1360, hr = W / 24, Y = 270, H = 62;
        const grow = interpolate(tt, [0.5, 3.4], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
        const day = interpolate(tt, [3.4, 4.2], [0, 1], clamp);
        const burn = interpolate(tt, [4.6, 7.2], [0, 1], { ...clamp, easing: Easing.linear });
        const stick = 120 * (1 - burn) + 6; const lit = burn < 0.99;
        const flick = 0.6 + 0.25 * Math.sin(fr / 2.3) + 0.15 * Math.sin(fr / 0.9);
        return (
          <>
            <div style={layer(1.0)}>
              {[[322, 692], [500, 742]].map(([x, y], i) => <div key={i} style={{ position: "absolute", left: x - 26, top: y - 26, width: 52, height: 52, borderRadius: "50%", mixBlendMode: "screen", opacity: 0.55 + 0.3 * Math.sin(fr / 4 + i * 2), background: "radial-gradient(circle, rgba(255,170,70,.9), rgba(255,170,70,0) 70%)" }} />)}
              <Smoke path={[[250, 590], [270, 540], [235, 490], [260, 440]]} fr={fr} n={5} speed={0.004} size={13} show={0.6} tone="170,175,190" />
            </div>
            <div style={layer(1.3)}>
              <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
                <rect x={X0 - 8} y={Y - 8} width={W + 16} height={H + 16} rx={10} fill="rgba(14,16,30,.62)" stroke={C.gold} strokeWidth="4" />
                <rect x={X0} y={Y} width={16.2 * hr * grow} height={H} fill="#1C2240" />
                <rect x={X0 + 16.2 * hr} y={Y} width={(24 - 16.2) * hr * day} height={H} fill="#E8B84A" />
                {Array.from({ length: Math.floor(16.2 * hr * grow / 40) }).map((_, i) => <circle key={i} cx={X0 + 14 + i * 40} cy={Y + 10 + ((i * 37) % 40)} r={1.8} fill="#F4EBD8" opacity={0.6 + 0.3 * Math.sin(fr / 6 + i)} />)}
                {[0, 4, 8, 12, 16, 20, 24].map((k) => <g key={k}><path d={`M${X0 + k * hr},${Y + H + 8} v16`} stroke={C.cream} strokeWidth="4" /><text x={X0 + k * hr} y={Y + H + 56} textAnchor="middle" fontFamily="Archivo" fontWeight={800} fontSize="28" fill={C.cream}>{k}</text></g>)}
                <text x={X0 + W / 2} y={Y + H + 92} textAnchor="middle" fontFamily="Archivo" fontWeight={800} fontSize="24" fill={C.gold} letterSpacing="3">HOURS AFTER SUNSET</text>
                {/* the rushlight burning down at hour 0 */}
                <g opacity={interpolate(tt, [4.2, 4.6], [0, 1], clamp)}>
                  <rect x={X0 + 4} y={Y - 14 - stick} width={10} height={stick} rx={3} fill="#E9E1CB" stroke={C.ink} strokeWidth="3" />
                  {lit && <g transform={`translate(${X0 + 9},${Y - 16 - stick}) scale(${0.45},${0.45 * (1 + 0.1 * Math.sin(fr / 2))})`}><path d="M0,-80 C22,-52 38,-28 32,-4 C26,14 -26,14 -32,-4 C-38,-28 -16,-48 0,-80 Z" fill="#E0762B" stroke={C.ink} strokeWidth="6" /><path d="M0,-44 C12,-28 18,-16 14,-2 C10,8 -10,8 -14,-2 C-18,-16 -6,-28 0,-44 Z" fill="#F4C34A" /></g>}
                </g>
                {lit && burn > 0 && <circle cx={X0 + 9} cy={Y - 30 - stick} r={60} fill="rgba(255,170,70,.25)" opacity={flick} />}
              </svg>
            </div>
            <div style={layer(1.6)}>
              <Label x={X0 + 8.1 * hr} y={Y - 56} tx={X0 + 8.1 * hr} ty={Y} text="NIGHT: ABOUT 16 HOURS" at={Math.max(P.label, 3.0)} t={tt} color="#8FA7E8" from="up" size={30} />
              <Label x={X0 + 20.1 * hr} y={Y - 56} tx={X0 + 20.1 * hr} ty={Y} text="DAYLIGHT: UNDER 8 HOURS" at={4.0} t={tt} color="#E8B84A" from="up" size={30} />
              <Label x={X0 + 190} y={Y - 128} tx={X0 + 9} ty={Y - 60} text="ONE RUSHLIGHT: UNDER AN HOUR" at={5.0} t={tt} color={C.orange} from="left" size={26} />
              <Label x={800} y={70} text="MIDWINTER, SOUTHERN ENGLAND" at={0.3} t={tt} color={C.gold} from="up" size={26} />
            </div>
          </>
        );
      }}
    </Stage>
  );
};

// ---------- 6) hungry gap chart drawn over a painted winter-to-summer field ----------
export const Gap: React.FC<{ s: S }> = ({ s }) => {
  const P = { lent: 8.0, ...(s.p ?? {}) } as Record<string, number>;
  const MS = ["NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG"];
  const X0 = 170, MW = 128, Y0 = 690, YT = 190;
  const mx = (m: number) => X0 + m * MW;
  const stores = [[mx(0), YT + 20], [mx(2.2), YT + 30], [mx(3.2), YT + 190], [mx(5), Y0]];
  const sD = `M${stores[0]} C${stores[1]} ${stores[2]} ${stores[3]}`;
  const cD = `M${mx(0)},${Y0} L${mx(8)},${Y0} C${mx(8.6)},${Y0} ${mx(9)},${YT + 40} ${mx(10)},${YT + 30}`;
  return (
    <Stage src="paint/gap.jpg" s={s} z0={1.0} z1={1.045} dx={-34} dy={-6} origin="40% 50%">
      {({ fr, t, layer }) => {
        const tt = t * (s.b - s.a);
        const sp = interpolate(tt, [0.3, 2.3], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
        const cp = interpolate(tt, [1.7, 3.1], [0, 1], clamp);
        const band = interpolate(tt, [2.5, 3.3], [0, 1], clamp);
        const lent = interpolate(tt, [P.lent - 0.4, P.lent + 0.2], [0, 1], clamp);
        const panel = interpolate(tt, [0, 0.6], [0, 1], clamp);
        return (
          <>
            <div style={layer(1.1)}>
              <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
                <defs><pattern id="hatch2" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="16" stroke="#7A2E22" strokeWidth="5" opacity="0.75" /></pattern></defs>
                <rect x={X0 - 56} y={YT - 64} width={mx(10) - X0 + 100} height={Y0 - YT + 180} rx={14} fill="rgba(244,235,216,.6)" stroke={C.brown} strokeWidth="5" opacity={panel} />
                <rect x={mx(5)} y={YT - 16} width={(mx(8) - mx(5)) * band} height={Y0 - YT + 16} fill="url(#hatch2)" stroke="#7A2E22" strokeWidth="4" opacity={band} />
                <path d={`M${X0 - 22},${Y0} H${mx(10)} M${X0 - 22},${YT - 20} V${Y0}`} stroke={C.brown} strokeWidth="7" fill="none" strokeLinecap="round" opacity={panel} />
                {MS.map((m, i) => <text key={m} x={mx(i) + MW / 2} y={Y0 + 44} textAnchor="middle" fontFamily="Archivo" fontWeight={800} fontSize="28" fill={C.brown} opacity={panel}>{m}</text>)}
                <path d={sD} pathLength={1} fill="none" stroke={C.ink} strokeWidth="21" strokeLinecap="round" strokeDasharray={1} strokeDashoffset={1 - sp} opacity={0.5} />
                <path d={sD} pathLength={1} fill="none" stroke={C.orange} strokeWidth="13" strokeLinecap="round" strokeDasharray={1} strokeDashoffset={1 - sp} />
                <path d={cD} pathLength={1} fill="none" stroke={C.ink} strokeWidth="21" strokeLinecap="round" strokeDasharray={1} strokeDashoffset={1 - cp} opacity={0.5} />
                <path d={cD} pathLength={1} fill="none" stroke={C.green} strokeWidth="13" strokeLinecap="round" strokeDasharray={1} strokeDashoffset={1 - cp} />
                <rect x={mx(4)} y={Y0 + 72} width={MW * 2 * lent} height={14} rx={4} fill={C.mid} opacity={lent} />
              </svg>
            </div>
            <div style={layer(1.6)}>
              <Label x={mx(1.2)} y={YT + 70} text="STORES" at={1.0} t={tt} color={C.orange} from="left" size={30} />
              <Label x={mx(8.9)} y={Y0 - 90} text="CROPS" at={2.2} t={tt} color={C.green} from="right" size={30} />
              <Label x={mx(5)} y={Y0 + 120} text="LENT" at={P.lent} t={tt} color={C.mid} from="up" size={28} />
              <div style={{ position: "absolute", left: mx(6.5), top: 440, transform: `translate(-50%,-50%) rotate(-7deg) scale(${interpolate(tt, [3.2, 3.35], [2.2, 1], clamp)})`, opacity: interpolate(tt, [3.2, 3.35], [0, 1], clamp), fontFamily: "Archivo", fontWeight: 800, fontSize: 62, color: "#7A2E22", border: "8px solid #7A2E22", padding: "4px 24px", letterSpacing: "0.05em", background: "rgba(244,235,216,.9)", whiteSpace: "nowrap" }}>THE HUNGRY GAP</div>
            </div>
          </>
        );
      }}
    </Stage>
  );
};
