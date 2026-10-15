import React from "react";
import {
  AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, interpolate,
  Easing, continueRender, delayRender, registerRoot, Composition,
} from "remotion";
import TL from "./timeline.json";
import words from "./words.json";
import { SubscribePopup } from "./EndCard";

// Medieval winter long (round 2 pilot) · 16:9 · painted stills + 8 AI clips + 6 coded paper-and-ink scenes.
// Everything is placed by build_tl.py from the spoken words. Music windows, mix gap and SFX come from timeline.json.

const FPS = 30;
const f = (s: number) => Math.round(s * FPS);
const DUR = f((TL as any).end);
const C = { gold: "#E7C27A", cream: "#F4EBD8", ink: "#0D0C0A", red: "#B3322B", paper: "#EADBB8", brown: "#3A2A1A", orange: "#E0762B", blue: "#3E6FA8", mid: "#6B5235" };

const h = delayRender("fonts");
Promise.all([
  ["Cinzel", "Cinzel-900.woff2", "900"], ["Archivo", "Archivo-800.woff2", "800"],
].map(([n, file, w]) => new FontFace(n, `url(${staticFile(file)}) format("woff2")`, { weight: w }).load().then((ff) => (document.fonts as any).add(ff)))).then(() => continueRender(h));

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const eo = Easing.out(Easing.cubic);
const eio = Easing.inOut(Easing.sin);

type Shot = {
  a: number; b: number; kind: string; src?: string; cam?: string; o?: string; z?: number[]; dir?: number;
  use?: number[]; rate?: number; scene?: string; p?: Record<string, number>;
};

// ---------- painted stills: varied camera (push toward the detail, pull, pan, hold) ----------
const Still: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame();
  const dur = f(s.b - s.a);
  const t = interpolate(fr, [0, dur], [0, 1], { ...clamp, easing: eio });
  const cam = s.cam ?? "hold";
  // standard (15 Oct): no punch-ins. static, or ONE slow eased move: push 1.00 to 1.04 / pull 1.04 to 1.00 over the whole shot, or a slow pan at a fixed 1.06.
  let scale = 1, tx = 0;
  if (cam === "push") scale = 1 + 0.04 * t;
  else if (cam === "pull") scale = 1.04 - 0.04 * t;
  else if (cam === "pan") { scale = 1.06; tx = (s.dir ?? 1) * (t - 0.5) * 70; }
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: C.ink }}>
      <Img src={staticFile(s.src!)} style={{ width: "100%", height: "100%", objectFit: "cover", transformOrigin: s.o ?? "50% 50%", transform: `translateX(${tx}px) scale(${scale})` }} />
    </AbsoluteFill>
  );
};
const Clip: React.FC<{ s: Shot }> = ({ s }) => (
  <AbsoluteFill style={{ background: C.ink }}>
    <OffthreadVideo src={staticFile(s.src!)} muted playbackRate={s.rate ?? 1} startFrom={f((s.use ?? [0])[0])} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "contrast(1.04) saturate(1.05)" }} />
  </AbsoluteFill>
);

// ---------- paper-and-ink coded scenes ----------
const Paper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, #F1E4C4 0%, ${C.paper} 55%, #C9B48A 100%)` }}>
    <AbsoluteFill style={{ border: `14px solid ${C.brown}`, boxShadow: `inset 0 0 0 6px ${C.paper}, inset 0 0 0 10px ${C.brown}` }} />
    {children}
  </AbsoluteFill>
);
const Rough: React.FC = () => (
  <defs>
    <filter id="rough" x="-2%" y="-2%" width="104%" height="104%"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="4" result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="5" /></filter>
    <pattern id="hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="14" stroke={C.brown} strokeWidth="3" opacity="0.5" /></pattern>
    <pattern id="thatch" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(70)"><line x1="0" y1="0" x2="0" y2="22" stroke="#6B4E2A" strokeWidth="4" /></pattern>
  </defs>
);
const popIn = (t: number, at: number) => interpolate(t, [at, at + 0.35], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
const Tag: React.FC<{ x: number; y: number; text: string; p: number; c?: string; size?: number; align?: "l" | "c" | "r" }> = ({ x, y, text, p, c = C.brown, size = 46, align = "c" }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: `translate(${align === "c" ? "-50%" : align === "r" ? "-100%" : "0"}, -50%) scale(${p})`, opacity: p, whiteSpace: "nowrap",
    fontFamily: "Archivo", fontWeight: 800, fontSize: size, letterSpacing: "0.05em", color: "#fff", background: c, padding: "6px 22px", border: `4px solid ${C.brown}`, boxShadow: "6px 6px 0 rgba(58,42,26,.35)" }}>{text}</div>
);
const Flame: React.FC<{ x: number; y: number; s?: number; fr: number }> = ({ x, y, s = 1, fr }) => {
  const k = 1 + 0.08 * Math.sin(fr / 3) + 0.05 * Math.sin(fr / 1.7);
  return (
    <g transform={`translate(${x},${y}) scale(${s * (1 + 0.02 * Math.sin(fr / 2.1))},${s * k})`}>
      <path d="M0,-96 C26,-62 48,-34 40,-6 C34,16 -34,16 -40,-6 C-48,-34 -20,-58 0,-96 Z" fill="#E0762B" stroke={C.brown} strokeWidth="5" strokeLinejoin="round" />
      <path d="M0,-52 C14,-34 24,-20 18,-4 C12,8 -12,8 -18,-4 C-24,-20 -8,-34 0,-52 Z" fill="#F4C34A" />
    </g>
  );
};
const Stones: React.FC<{ x: number; y: number; w?: number }> = ({ x, y, w = 150 }) => (
  <g stroke={C.brown} strokeWidth="5" fill="#B9A786">
    {[-0.9, -0.5, -0.1, 0.3, 0.7].map((k, i) => <ellipse key={i} cx={x + k * w * 0.55} cy={y + (i % 2) * 5} rx={w * 0.17} ry={w * 0.11} />)}
  </g>
);

// 1) Question card: ink-stamp, line by line
const QCard: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame(); const t = fr / FPS; const d = s.b - s.a;
  const lines = ["HOW DO YOU", "SURVIVE A WHOLE", "WINTER LIKE THIS?"];
  const out = interpolate(t, [d - 0.45, d], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  return (
    <Paper>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `translateX(${out * 2100}px)` }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          {lines.map((l, k) => {
            const p = interpolate(t, [0.2 + k * 0.8, 0.2 + k * 0.8 + 0.18], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
            return <div key={k} style={{ opacity: p, transform: `scale(${1.7 - 0.7 * p}) rotate(${(k - 1) * -1.2}deg)`, fontFamily: "Archivo", fontWeight: 800, fontSize: 150, lineHeight: 1.08, color: k === 2 ? C.red : C.brown, letterSpacing: "0.015em" }}>{l}</div>;
          })}
        </div>
      </AbsoluteFill>
    </Paper>
  );
};

// 2) Longhouse cutaway: one long building, family end up the slope, cattle end below, drain, smoke through the thatch. No chimney.
const Cutaway: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame(); const t = fr / FPS;
  const P = { cross: 2.4, fam: 5.3, ship: 7.6, drain: 10.5, dung: 12.4, ...(s.p ?? {}) } as Record<string, number>;
  P.dung = Math.min(P.dung, s.b - s.a - 1.4);
  const draw = interpolate(t, [0.2, 2.4], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const smoke = interpolate(t, [2.6, 3.4], [0, 1], clamp);
  const cow = (x: number, k: number) => (
    <g key={k} transform={`translate(${x},${268}) scale(${1})`} stroke={C.brown} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
      <rect x={0} y={-70} width={150} height={66} rx={26} fill="#B98B5E" />
      <rect x={134} y={-96} width={50} height={48} rx={18} fill="#B98B5E" />
      <path d="M168,-96 l-8,-22 M184,-96 l8,-22" fill="none" />
      <path d="M14,-6 v34 M44,-6 v34 M108,-6 v34 M134,-6 v34" fill="none" strokeWidth="9" />
      <path d="M-4,-52 q-26,16 -14,44" fill="none" />
      <path d="M180,-60 L230,-64" fill="none" strokeDasharray="8 8" />
    </g>
  );
  const arrow = (x0: number, delay: number, k: number) => {
    const p = interpolate(t, [2.6 + delay, 3.8 + delay], [0, 1], clamp);
    const dash = ((fr * 2) % 40);
    return (
      <g key={k} opacity={smoke * (1 - 0.0)}>
        <path d={`M${x0},330 C${x0 + 30},250 ${x0 - 30},180 ${x0 + 10},95`} fill="none" stroke="#8C8272" strokeWidth="9" strokeDasharray="22 14" strokeDashoffset={-dash} strokeLinecap="round" opacity={0.9 * p} />
        <path d={`M${x0 + 10},95 l-16,22 m16,-22 l20,18`} fill="none" stroke="#8C8272" strokeWidth="9" strokeLinecap="round" opacity={p} />
      </g>
    );
  };
  return (
    <Paper>
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        <Rough />
        <g>
          {/* sloping ground */}
          <path d="M60,610 L1860,775 L1860,1000 L60,1000 Z" fill="#C9B48A" stroke={C.brown} strokeWidth="6" opacity={draw} />
          <g transform="translate(180,355) rotate(5.2)" opacity={draw}>
            {/* interior */}
            <rect x={0} y={90} width={1560} height={270} fill="#F6EDD6" stroke={C.brown} strokeWidth="6" />
            {/* floor and drain */}
            <path d="M0,360 H1560" stroke={C.brown} strokeWidth="8" />
            <path d="M700,350 H1560 V366 H700 Z" fill="#9DB3BF" stroke={C.brown} strokeWidth="4" />
            {/* cross-passage: two doorways */}
            <path d="M690,90 V360 M900,90 V360" stroke={C.brown} strokeWidth="6" strokeDasharray="14 10" />
            <path d="M690,360 a60,60 0 0 1 0,-110" fill="none" stroke={C.brown} strokeWidth="4" />
            {/* family end: hearth, bed bundles, bench */}
            <Stones x={330} y={350} w={190} />
            <Flame x={330} y={344} s={1} fr={fr} />
            <rect x={90} y={316} width={150} height={40} rx={20} fill="#CDBA95" stroke={C.brown} strokeWidth="5" />
            <rect x={470} y={322} width={130} height={36} rx={18} fill="#CDBA95" stroke={C.brown} strokeWidth="5" />
            <path d="M120,300 q22,-30 44,0 M196,300 q22,-30 44,0" fill="none" stroke={C.brown} strokeWidth="5" />
            {/* cattle end */}
            {cow(930, 0)}{cow(1130, 1)}{cow(1330, 2)}
            {/* walls */}
            <rect x={-12} y={90} width={28} height={278} fill="#A98B5A" stroke={C.brown} strokeWidth="6" />
            <rect x={1544} y={90} width={28} height={278} fill="#A98B5A" stroke={C.brown} strokeWidth="6" />
            {/* small hole for the dung, low in the right wall */}
            <rect x={1540} y={318} width={36} height={32} fill="#F6EDD6" stroke={C.brown} strokeWidth="4" />
            {/* thatch roof, no chimney */}
            <path d="M-50,100 L40,18 L1520,18 L1610,100 Z" fill="#CBA866" stroke={C.brown} strokeWidth="7" strokeLinejoin="round" />
            <path d="M-50,100 L40,18 L1520,18 L1610,100 Z" fill="url(#thatch)" opacity="0.7" />
            <path d="M-50,100 q20,18 40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0" fill="#CBA866" stroke={C.brown} strokeWidth="5" />
            {arrow(300, 0, 0)}{arrow(360, 0.35, 1)}{arrow(420, 0.7, 2)}
          </g>
        </g>
      </svg>
      <Tag x={380} y={236} text="FAMILY" p={popIn(t, P.fam)} c={C.blue} />
      <Tag x={900} y={236} text="CROSS-PASSAGE" p={popIn(t, P.cross + 0.6)} c={C.mid} />
      <Tag x={1480} y={236} text="SHIPPON (CATTLE)" p={popIn(t, P.ship)} c={C.red} />
      <Tag x={1130} y={905} text="DRAIN" p={popIn(t, P.drain)} c={C.blue} />
      <Tag x={1600} y={905} text="DUNG HOLE" p={popIn(t, P.dung)} c={C.mid} />
      <Tag x={110} y={905} text="SMOKE OUT THROUGH THE THATCH" p={popIn(t, P.cross + 1.4)} c="#6F6759" size={32} align="l" />
    </Paper>
  );
};

// 3) Heat figure: front about 30 C, back about 6 C, turning like meat on a spit
const Heat: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame(); const t = fr / FPS;
  const P = { t30: 4.4, t6: 5.9, ...(s.p ?? {}) } as Record<string, number>;
  const raw = Math.cos((t * Math.PI) / 3.3); const spin = (raw < 0 ? -1 : 1) * Math.max(Math.abs(raw), 0.5);
  const front = interpolate(t, [0.2, 1.2], [0, 1], clamp);
  const figure = (
    <g transform={`translate(640,610) scale(${spin},1)`} stroke={C.brown} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
      <clipPath id="rightHalf"><rect x={0} y={-400} width={300} height={800} /></clipPath>
      <clipPath id="leftHalf"><rect x={-300} y={-400} width={300} height={800} /></clipPath>
      {(["leftHalf", "rightHalf"] as const).map((cp) => (
        <g key={cp} clipPath={`url(#${cp})`}>
          <g fill={cp === "rightHalf" ? "#EE8A3B" : "#7FA3CF"}>
            <circle cx={0} cy={-210} r={62} />
            <rect x={-70} y={-140} width={140} height={190} rx={40} />
            <rect x={-70} y={40} width={150} height={56} rx={26} />
            <rect x={20} y={80} width={60} height={150} rx={22} />
            <rect x={-60} y={80} width={60} height={150} rx={22} />
          </g>
        </g>
      ))}
      <circle cx={0} cy={-210} r={62} fill="none" /><rect x={-70} y={-140} width={140} height={190} rx={40} fill="none" />
      <rect x={-70} y={40} width={150} height={56} rx={26} fill="none" />
      <rect x={20} y={80} width={60} height={150} rx={22} fill="none" /><rect x={-60} y={80} width={60} height={150} rx={22} fill="none" />
      <path d="M0,-150 V40" stroke="none" />
      <circle cx={22} cy={-218} r={7} fill={C.brown} stroke="none" />
    </g>
  );
  const warmArrows = [0, 1, 2].map((k) => {
    const p = interpolate(t, [0.8 + k * 0.2, 1.6 + k * 0.2], [0, 1], clamp);
    const off = (fr * 1.2 + k * 24) % 36;
    return <path key={k} d={`M1160,${560 + k * 56} C1040,${540 + k * 56} 960,${580 + k * 56} 820,${560 + k * 56}`} fill="none" stroke={C.orange} strokeWidth="10" strokeDasharray="26 14" strokeDashoffset={off} strokeLinecap="round" opacity={p} />;
  });
  const coldArrows = [0, 1].map((k) => {
    const p = interpolate(t, [1.4 + k * 0.2, 2.2 + k * 0.2], [0, 1], clamp);
    const off = (fr * 1.2 + k * 20) % 36;
    return <path key={k} d={`M120,${520 + k * 90} C240,${510 + k * 90} 330,${540 + k * 90} 470,${530 + k * 90}`} fill="none" stroke={C.blue} strokeWidth="10" strokeDasharray="26 14" strokeDashoffset={-off} strokeLinecap="round" opacity={p} />;
  });
  return (
    <Paper>
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        <Rough />
        <g>
          <path d="M80,870 H1840" stroke={C.brown} strokeWidth="7" opacity="0.8" />
          <Stones x={1260} y={850} w={260} /><Flame x={1260} y={838} s={1.45} fr={fr} />
          {warmArrows}{coldArrows}
          <g opacity={front}>{figure}</g>
          <path d="M650,900 H1260" stroke={C.brown} strokeWidth="5" />
          <path d="M650,884 v32 M1260,884 v32" stroke={C.brown} strokeWidth="5" />
        </g>
      </svg>
      <Tag x={955} y={940} text="ABOUT 1 METRE FROM THE FIRE" p={popIn(t, 0.9)} c={C.mid} size={32} />
      <Tag x={1230} y={300} text="FRONT: ABOUT 30 °C" p={popIn(t, P.t30)} c={C.orange} size={60} />
      <Tag x={560} y={300} text="BACK: ABOUT 6 °C" p={popIn(t, P.t6)} c={C.blue} size={60} />
    </Paper>
  );
};

// 4) Winter food countdown calendar: Nov to Apr, days crossed off while the barrel drains; the last days are left blank
const MONTHS: [string, number][] = [["NOV", 30], ["DEC", 31], ["JAN", 31], ["FEB", 28], ["MAR", 31], ["APR", 30]];
const Calendar: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame(); const t = fr / FPS;
  const fade = interpolate(t, [0, 0.6], [0, 1], clamp);
  const P = { mart: 4.0, start: 6.0, end: 13.0, ...(s.p ?? {}) } as Record<string, number>;
  const start = P.start, end = Math.min(P.end, s.b - s.a - 2.6), STOP = 131; // day index where the crossing stops (mid March): the rest stay blank
  const crossed = Math.floor(interpolate(t, [start, end], [10, STOP], { ...clamp, easing: Easing.inOut(Easing.quad) }));
  const level = interpolate(t, [start, end], [1, 0.08], clamp);
  const mart = popIn(t, P.mart);
  const q = interpolate(t, [end + 0.2, end + 0.8], [0, 1], clamp);
  let idx = 0;
  const blocks = MONTHS.map(([name, days], m) => {
    const bx = 100 + (m % 3) * 470, by = 150 + Math.floor(m / 3) * 420;
    const cells = Array.from({ length: days }, (_, d) => {
      const i = idx + d; const cx = bx + (d % 10) * 42, cy = by + 70 + Math.floor(d / 10) * 42;
      const on = i < crossed && i >= 10;
      const isMart = i === 10;
      return (
        <g key={d}>
          <rect x={cx} y={cy} width={36} height={36} rx={4} fill={isMart ? C.gold : "#F4EBD8"} stroke={C.brown} strokeWidth="3" strokeDasharray={i >= STOP ? "6 5" : undefined} />
          {on && <path d={`M${cx + 6},${cy + 6} L${cx + 30},${cy + 30} M${cx + 30},${cy + 6} L${cx + 6},${cy + 30}`} stroke={C.red} strokeWidth="6" strokeLinecap="round" />}
        </g>
      );
    });
    idx += days;
    return (
      <g key={name}>
        <text x={bx} y={by + 42} fontFamily="Cinzel" fontWeight={900} fontSize="48" fill={C.brown}>{name}</text>
        {cells}
      </g>
    );
  });
  const bar = 560 * level;
  return (
    <Paper>
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, opacity: fade }}>
        <Rough />
        <g>
          {blocks}
          {/* barrel */}
          <g>
            <rect x={1560} y={250} width={230} height={600} rx={46} fill="#F4EBD8" stroke={C.brown} strokeWidth="7" />
            <clipPath id="barrelClip"><rect x={1566} y={256} width={218} height={588} rx={42} /></clipPath>
            <rect x={1566} y={844 - bar} width={218} height={bar + 4} fill="#D9A648" clipPath="url(#barrelClip)" />
            <path d="M1560,380 H1790 M1560,560 H1790 M1560,720 H1790" stroke={C.brown} strokeWidth="9" />
            <rect x={1560} y={250} width={230} height={600} rx={46} fill="none" stroke={C.brown} strokeWidth="7" />
            <text x={1675} y={920} textAnchor="middle" fontFamily="Archivo" fontWeight={800} fontSize="40" fill={C.brown}>GRAIN</text>
          </g>
          <text x={1450} y={820} fontFamily="Archivo" fontWeight={800} fontSize="170" fill={C.red} opacity={q} textAnchor="middle">?</text>
        </g>
      </svg>
      <Tag x={900} y={90} text="MARTINMAS: 11 NOVEMBER" p={mart} c={C.mid} size={40} />
    </Paper>
  );
};

// 5) Night length bar: sunset to sunrise about 16 h, one rushlight burns under an hour
const NightBar: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame(); const t = fr / FPS;
  const P = { label: 3.2, ...(s.p ?? {}) } as Record<string, number>;
  const X0 = 160, W = 1600, hr = W / 24;
  const grow = interpolate(t, [0.4, 3.6], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const darkW = 16.2 * hr * grow, dayP = interpolate(t, [3.6, 4.4], [0, 1], clamp);
  const burn = interpolate(t, [4.6, 7.0], [0, 1], { ...clamp, easing: Easing.linear });
  const stick = 150 * (1 - burn) + 8;
  const lit = burn < 0.995;
  return (
    <Paper>
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        <Rough />
        <g>
          <rect x={X0} y={470} width={W} height={120} fill="none" stroke={C.brown} strokeWidth="7" />
          <rect x={X0} y={470} width={darkW} height={120} fill="#2B2A3A" />
          <rect x={X0 + 16.2 * hr} y={470} width={(24 - 16.2) * hr * dayP} height={120} fill="#F0C65A" />
          {[0, 4, 8, 12, 16, 20, 24].map((k) => <g key={k}><path d={`M${X0 + k * hr},590 v22`} stroke={C.brown} strokeWidth="5" /><text x={X0 + k * hr} y={662} textAnchor="middle" fontFamily="Archivo" fontWeight={800} fontSize="34" fill={C.brown}>{k}</text></g>)}
          <text x={X0 + W / 2} y={712} textAnchor="middle" fontFamily="Archivo" fontWeight={800} fontSize="34" fill={C.mid}>HOURS AFTER SUNSET</text>
          {/* rushlight */}
          <g opacity={interpolate(t, [4.2, 4.6], [0, 1], clamp)}>
            <rect x={X0 + 6} y={460 - stick} width={12} height={stick} fill="#E6DFC8" stroke={C.brown} strokeWidth="4" />
            {lit && <Flame x={X0 + 12} y={455 - stick} s={0.42} fr={fr} />}
          </g>
        </g>
      </svg>
      <Tag x={960} y={190} text="MIDWINTER, SOUTHERN ENGLAND" p={popIn(t, 0.3)} c={C.mid} size={46} />
      <Tag x={X0 + 8.1 * hr} y={405} text="NIGHT: ABOUT 16 HOURS" p={popIn(t, Math.max(P.label, 3.0))} c="#2B2A3A" size={52} />
      <Tag x={X0 + 20.1 * hr} y={405} text="DAYLIGHT: UNDER 8 HOURS" p={popIn(t, 4.1)} c="#B07C14" size={44} />
      <Tag x={X0 + 130} y={300} text="ONE RUSHLIGHT: UNDER AN HOUR" p={popIn(t, 5.0)} c={C.red} size={40} align="l" />
    </Paper>
  );
};

// 6) Hungry gap: stores run down, crops not ready, the space between is the gap (Lent inside it)
const Gap: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame(); const t = fr / FPS;
  const P = { lent: 8.0, ...(s.p ?? {}) } as Record<string, number>;
  const MS = ["NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG"];
  const X0 = 200, MW = 152, Y0 = 800, YT = 260;
  const mx = (m: number) => X0 + m * MW;
  const sp = interpolate(t, [0.2, 2.2], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const cp = interpolate(t, [1.6, 3.0], [0, 1], clamp);
  const band = interpolate(t, [2.4, 3.2], [0, 1], clamp);
  const lent = interpolate(t, [P.lent - 0.4, P.lent + 0.2], [0, 1], clamp);
  const stores = `M${mx(0)},${YT + 30} C${mx(2)},${YT + 40} ${mx(3)},${YT + 200} ${mx(5)},${Y0}`;
  const crops = `M${mx(0)},${Y0} L${mx(8)},${Y0} C${mx(8.6)},${Y0} ${mx(9)},${YT + 60} ${mx(10)},${YT + 50}`;
  return (
    <Paper>
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        <Rough />
        <g>
          <rect x={mx(5)} y={YT - 30} width={(mx(8) - mx(5)) * band} height={Y0 - YT + 30} fill="url(#hatch)" stroke={C.brown} strokeWidth="5" opacity={band} />
          <rect x={mx(4)} y={Y0 + 70} width={MW * 2 * lent} height={20} fill={C.mid} opacity={lent} />
          <path d={`M${X0 - 20},${Y0} H${mx(10)}`} stroke={C.brown} strokeWidth="8" />
          <path d={`M${X0 - 20},${YT - 30} V${Y0}`} stroke={C.brown} strokeWidth="8" />
          {MS.map((m, i) => <text key={m} x={mx(i) + MW / 2} y={Y0 + 50} textAnchor="middle" fontFamily="Archivo" fontWeight={800} fontSize="34" fill={C.brown}>{m}</text>)}
          <path d={stores} pathLength={1} fill="none" stroke={C.orange} strokeWidth="14" strokeLinecap="round" strokeDasharray={1} strokeDashoffset={1 - sp} />
          <path d={crops} pathLength={1} fill="none" stroke="#4E7A3A" strokeWidth="14" strokeLinecap="round" strokeDasharray={1} strokeDashoffset={1 - cp} />
        </g>
      </svg>
      <Tag x={mx(1.4)} y={YT + 30} text="STORES" p={popIn(t, 1.0)} c={C.orange} size={44} />
      <Tag x={mx(8.6)} y={Y0 - 110} text="CROPS" p={popIn(t, 2.2)} c="#4E7A3A" size={44} />
      <Tag x={mx(5)} y={Y0 + 120} text="LENT" p={lent} c={C.mid} size={36} />
      <div style={{ position: "absolute", left: mx(6.5), top: 520, transform: `translate(-50%,-50%) rotate(-8deg) scale(${interpolate(t, [3.2, 3.35], [2.2, 1], clamp)})`, opacity: interpolate(t, [3.2, 3.35], [0, 1], clamp),
        fontFamily: "Archivo", fontWeight: 800, fontSize: 60, color: C.red, border: `8px solid ${C.red}`, padding: "4px 22px", letterSpacing: "0.05em", background: "rgba(234,219,184,.85)", whiteSpace: "nowrap" }}>THE HUNGRY GAP</div>
      <div style={{ position: "absolute", left: 60, top: 44, fontFamily: "Archivo", fontWeight: 800, fontSize: 28, color: C.mid }}>an illustration, not data</div>
    </Paper>
  );
};

// ---------- overlays + captions ----------
const Chapter: React.FC<{ t: string; dur: number }> = ({ t, dur }) => {
  const fr = useCurrentFrame();
  const op = interpolate(fr, [0, 8, dur - 8, dur], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 92, opacity: op, background: "linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,0) 38%)" }}>
      <div style={{ fontFamily: "Cinzel", fontWeight: 900, fontSize: 76, textAlign: "center", color: C.cream, letterSpacing: "0.1em", textShadow: "0 6px 30px rgba(0,0,0,.8)" }}>{t}</div>
      <div style={{ width: 420, height: 3, marginTop: 10, background: `linear-gradient(90deg, transparent, ${C.gold}, transparent)` }} />
    </AbsoluteFill>
  );
};
type Wd = { w: string; s: number; e: number };
const groups: Wd[][] = (() => {
  const out: Wd[][] = []; let cur: Wd[] = [];
  for (const w of words as Wd[]) { cur.push(w); if (cur.length >= 7 || /[.,!?:…"”]$/.test(w.w)) { out.push(cur); cur = []; } }
  if (cur.length) out.push(cur);
  return out;
})();
const Captions: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const i = groups.findIndex((g, k) => t >= g[0].s - 0.05 && t < Math.min(groups[k + 1]?.[0].s ?? 1e9, g[g.length - 1].e + 0.7));
  if (i < 0) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 58 }}>
      <div style={{ fontFamily: "Archivo", fontWeight: 800, fontSize: 40, lineHeight: 1.2, maxWidth: 1400, textAlign: "center", color: "#fff", textShadow: "0 2px 0 #000, 0 0 10px rgba(0,0,0,.9), 0 0 3px #000" }}>
        {groups[i].map((w, k) => <span key={k} style={{ color: t >= w.s - 0.03 && t < w.e + 0.05 ? C.gold : "#fff", marginRight: 12 }}>{w.w}</span>)}
      </div>
    </AbsoluteFill>
  );
};

const Film: React.FC = () => {
  const tl = TL as any;
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      {(tl.shots as Shot[]).map((s, i) => (
        <Sequence key={i} from={f(s.a)} durationInFrames={Math.max(1, f(s.b) - f(s.a))}>
          {s.kind === "clip" ? <Clip s={s} /> : s.kind === "q" ? <QCard s={s} /> : s.kind === "cut" ? <Cutaway s={s} /> : s.kind === "heat" ? <Heat s={s} /> : s.kind === "cal" ? <Calendar s={s} /> : s.kind === "night" ? <NightBar s={s} /> : s.kind === "gap" ? <Gap s={s} /> : <Still s={s} />}
        </Sequence>
      ))}
      <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 62%, rgba(8,6,2,.30) 100%)" }} />
      {(tl.text as any[]).map((x, i) => <Sequence key={`t${i}`} from={f(x.a)} durationInFrames={f(x.b) - f(x.a)}><Chapter t={x.t} dur={f(x.b) - f(x.a)} /></Sequence>)}
      {(tl.subs as number[]).map((a, i) => <Sequence key={`p${i}`} from={f(a)} durationInFrames={150}><SubscribePopup /></Sequence>)}
      <Captions />
    </AbsoluteFill>
  );
};

registerRoot(() => <Composition id="Long" component={Film} durationInFrames={DUR} fps={FPS} width={1920} height={1080} />);
