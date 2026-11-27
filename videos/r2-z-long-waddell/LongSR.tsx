import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, interpolate, spring, Easing, continueRender, delayRender, registerRoot, Composition } from "remotion";
import TL from "./timeline.json";
import { withSubkit } from "./SubscribeKit";
import MAPS from "./maps.json";

// SportsRoom long 2 (Johnson vs Jeffries), 16:9 1920x1080. Built by tools/build_tl.py from the voice word timings and shotlist.py.
// Shot kinds: img (full-frame still, one eased move), comp (whole picture on a blurred copy), vid (archive film clip, pre-cut by tools/cutfilm.py,
// shown whole on a blurred copy of itself; mask = plain projector-gate frame), card (text card), map (coded map: world/US outlines,
// public domain Natural Earth + US Census), tl (coded timeline), split (two pictures side by side), tent (coded border-tent diagram).
// Overlays: label (top-left tag), rnd (round tracker, top-right), over (big stat text over a film shot), Subscribe pill, captions (Anton, SportsRoom red #DD1118).
const FPS = 30;
const f = (s: number) => Math.round(s * FPS);
const C = { red: "#DD1118", ink: "#0E0C0A", cream: "#F3EEE4", land: "#2b2621", land2: "#3a332c", line: "#7a6e60", sea: "#0f0d0b" };
const h = delayRender("fonts");
Promise.all([["Anton", "Anton.woff2", "400"], ["Archivo", "Archivo-900.woff2", "900"]].map(([n, file, w]) => new FontFace(n, `url(${staticFile(file)}) format("woff2")`, { weight: w }).load().then((ff) => (document.fonts as any).add(ff)))).then(() => continueRender(h));
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const DISPLAY: React.CSSProperties = { fontFamily: "Anton, Impact, sans-serif", textTransform: "uppercase", letterSpacing: "0.01em" };
type Pt = { n: string; lon: number; lat: number; step?: number; hi?: boolean; dx?: number; dy?: number };
type Shot = { a: number; b: number; kind: string; src?: string; src2?: string; cam?: string; o?: string; dir?: number; text?: string; bg?: string; label?: string; rnd?: string; over?: string; mask?: boolean;
  view?: number[]; base?: string; pts?: Pt[]; routes?: number[][]; step?: number; title?: string; hiStates?: string[]; reel?: boolean; stops?: number[][]; items?: string[][]; upto?: number; from?: number };

const move = (cam: string | undefined, t: number, dir = 1, amp = 1) => {
  let scale = 1, tx = 0;
  if (cam === "push") scale = 1 + 0.06 * amp * t; else if (cam === "pull") scale = 1 + 0.06 * amp * (1 - t); else if (cam === "pan") { scale = 1.08; tx = dir * (t - 0.5) * 90 * amp; }
  return { scale, tx };
};
const useT = (s: Shot) => { const fr = useCurrentFrame(); return interpolate(fr, [0, f(s.b - s.a)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) }); };

const Still: React.FC<{ s: Shot }> = ({ s }) => {
  const t = useT(s); const { scale, tx } = move(s.cam, t, s.dir);
  return <AbsoluteFill style={{ overflow: "hidden", background: C.ink }}>
    <Img src={staticFile(s.src!)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: s.o ?? "50% 50%", transformOrigin: s.o ?? "50% 50%", transform: `translateX(${tx}px) scale(${scale})` }} />
  </AbsoluteFill>;
};
const Blur: React.FC<{ src: string }> = ({ src }) => <Img src={staticFile(src)} style={{ position: "absolute", inset: -60, width: "calc(100% + 120px)", height: "calc(100% + 120px)", objectFit: "cover", filter: "blur(38px) brightness(0.42) saturate(0.8)" }} />;
const Comp: React.FC<{ s: Shot }> = ({ s }) => {
  const t = useT(s); const { scale, tx } = move(s.cam === "pan" ? "push" : s.cam, t, s.dir, 0.8);
  return <AbsoluteFill style={{ overflow: "hidden", background: C.ink }}><Blur src={s.src!} />
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <Img src={staticFile(s.src!)} style={{ width: s.kind === "small" ? "46%" : "92%", height: s.kind === "small" ? "46%" : "100%", objectFit: "contain", transformOrigin: s.o ?? "50% 50%", transform: `translateX(${tx}px) scale(${scale})`, filter: "drop-shadow(0 18px 40px rgba(0,0,0,.65))" }} />
    </AbsoluteFill>
  </AbsoluteFill>;
};
const Split: React.FC<{ s: Shot }> = ({ s }) => {
  const t = useT(s);
  const half = (src: string, k: number) => <div style={{ position: "absolute", top: 80, bottom: 170, left: k ? 980 : 80, width: 860, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
    <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: (s as any).fit === "cover" ? "cover" : "contain", objectPosition: "50% 30%", transform: `scale(${1 + 0.05 * (k ? 1 - t : t)})` }} /></div>;
  return <AbsoluteFill style={{ background: C.ink, overflow: "hidden" }}><Blur src={s.src!} />{half(s.src!, 0)}{half(s.src2!, 1)}</AbsoluteFill>;
};
const Vid: React.FC<{ s: Shot }> = ({ s }) => {
  const t = useT(s); const sc = 1 + 0.04 * (s.dir && s.dir > 0 ? t : 1 - t);
  const box: React.CSSProperties = s.mask ? { position: "absolute", left: 330, top: 110, width: 1260, height: 860, borderRadius: 46, overflow: "hidden", border: "14px solid #050403", boxShadow: "0 0 0 2000px rgba(5,4,3,.82), inset 0 0 80px rgba(0,0,0,.8)" }
    : { position: "absolute", left: 240, top: 0, width: 1440, height: 1080, overflow: "hidden", boxShadow: "0 0 60px rgba(0,0,0,.7)" };
  return <AbsoluteFill style={{ background: C.ink, overflow: "hidden" }}>
    <OffthreadVideo src={staticFile(s.src!)} muted style={{ position: "absolute", inset: -60, width: "calc(100% + 120px)", height: "calc(100% + 120px)", objectFit: "cover", filter: "blur(36px) brightness(0.38)" }} />
    <div style={box}><OffthreadVideo src={staticFile(s.src!)} muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${sc})` }} /></div>
  </AbsoluteFill>;
};
const Paper: React.FC<{ s: Shot }> = ({ s }) => s.bg
  ? <Img src={staticFile(s.bg)} style={{ position: "absolute", inset: -60, width: "calc(100% + 120px)", height: "calc(100% + 120px)", objectFit: "cover", filter: "blur(22px) brightness(0.28) saturate(0.6)" }} />
  : <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 42%, #2a2520 0%, #14110e 65%, #0a0908 100%)" }} />;
const Card: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame(); const sp = spring({ frame: fr, fps: FPS, config: { damping: 14, stiffness: 170 } });
  const lines = (s.text ?? "").split("\n"); const big = lines.some((l) => l.length > 26);
  return <AbsoluteFill style={{ background: C.ink, overflow: "hidden" }}><Paper s={s} />
    <AbsoluteFill style={{ alignItems: "center", justifyContent: (s as any).top ? "flex-start" : "center", paddingBottom: 120, paddingTop: (s as any).top ? 110 : 0 }}>
      <div style={{ width: interpolate(sp, [0, 1], [0, 220]), height: 10, background: C.red, marginBottom: 34 }} />
      {lines.map((l, i) => <div key={i} style={{ ...DISPLAY, fontSize: big ? 80 : lines.length > 2 ? 92 : 118, lineHeight: 1.06, color: i === 0 ? C.cream : C.red, textAlign: "center", maxWidth: 1640, opacity: interpolate(fr, [i * 6, i * 6 + 9], [0, 1], clamp), transform: `translateY(${interpolate(sp, [0, 1], [30, 0])}px)`, textShadow: "0 6px 30px rgba(0,0,0,.6)" }}>{l}</div>)}
    </AbsoluteFill></AbsoluteFill>;
};
// ---- coded maps: lon/lat outlines, x scaled by cos(centre latitude)
const MapShot: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame(); const dur = f(s.b - s.a);
  const [lon0, lat0, lon1, lat1] = s.view!; const latc = (lat0 + lat1) / 2; const kx = Math.cos(latc * Math.PI / 180);
  const z = interpolate(fr, [0, dur], [1, 1.045], clamp);
  const sx = 1920 / ((lon1 - lon0) * kx), sy = 1080 / (lat1 - lat0); const sc = Math.min(sx, sy);
  const ox = (1920 - (lon1 - lon0) * kx * sc) / 2, oy = (1080 - (lat1 - lat0) * sc) / 2;
  const P = (lon: number, lat: number) => [ox + (lon - lon0) * kx * sc, oy + (lat1 - lat) * sc];
  const step = s.step ?? 1, from = s.from ?? 0;
  const appear = (st: number | undefined) => { const k = (st ?? 1); if (k <= from) return 1; const order = k - from; return interpolate(fr, [8 + (order - 1) * 14, 20 + (order - 1) * 14], [0, 1], clamp); };
  const pts = (s.pts ?? []).filter((p) => (p.step ?? 1) <= step);
  const land = s.base === "us" ? (MAPS as any).world.filter((c: any) => c.name !== "United States of America") : (MAPS as any).world;
  const tf = `translate(${ox - lon0 * kx * sc},${oy + lat1 * sc}) scale(${kx * sc},${sc})`;
  return <AbsoluteFill style={{ background: C.sea, overflow: "hidden" }}>
    <svg width={1920} height={1080} style={{ transform: `scale(${z})`, transformOrigin: "50% 50%" }}>
      <g transform={tf}>
        {land.map((c: any, i: number) => <path key={i} d={c.d} fill={C.land} stroke={C.line} strokeWidth={1.1} vectorEffect="non-scaling-stroke" />)}
        {s.base === "us" && (MAPS as any).states.map((c: any, i: number) => { const hi = (s.hiStates ?? []).includes(c.name);
          return <path key={`s${i}`} d={c.d} fill={hi ? "#5a1a17" : C.land2} stroke={hi ? C.red : C.line} strokeWidth={hi ? 3 : 1} vectorEffect="non-scaling-stroke" />; })}
      </g>
      {(s.routes ?? []).filter((r) => (r[2] ?? 1) <= step).map((r, i) => {
        const [x1, y1] = P(s.pts![r[0]].lon, s.pts![r[0]].lat), [x2, y2] = P(s.pts![r[1]].lon, s.pts![r[1]].lat);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.18; const L = Math.hypot(x2 - x1, y2 - y1) * 1.15;
        const st = r[2] ?? 1; const order = i - (s.routes ?? []).filter((q) => (q[2] ?? 1) <= from).length;
        const k = st <= from ? 1 : interpolate(fr, [6 + order * 16, 30 + order * 16], [0, 1], clamp);
        return <path key={i} d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`} fill="none" stroke={C.red} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${L}`} strokeDashoffset={L * (1 - k)} />;
      })}
      {(s.stops ?? []).map((r, i) => { const [x1, y1] = P(r[0], r[1]), [x2, y2] = P(r[2], r[3]); const k = step >= 2 ? 1 : interpolate(fr, [10 + i * 6, 34 + i * 6], [0, 1], clamp);
        const ex = x1 + (x2 - x1) * k, ey = y1 + (y2 - y1) * k; const nx = -(y2 - y1), ny = x2 - x1, nl = Math.hypot(nx, ny) || 1; const bar = step >= 2 ? 34 : 0;
        return <g key={`st${i}`}><line x1={x1} y1={y1} x2={ex} y2={ey} stroke={C.cream} strokeWidth={7} strokeLinecap="round" />
          {bar > 0 && <line x1={x2 + nx / nl * bar} y1={y2 + ny / nl * bar} x2={x2 - nx / nl * bar} y2={y2 - ny / nl * bar} stroke={C.red} strokeWidth={12} strokeLinecap="round" opacity={interpolate(fr, [6 + i * 5, 14 + i * 5], [0, 1], clamp)} />}</g>; })}
      {s.reel && (() => { const [x, y] = P(-116.9, 39.3); return <g transform={`translate(${x},${y}) rotate(${fr * 2})`}><circle r={44} fill="#111" stroke={C.cream} strokeWidth={6} />{[0, 72, 144, 216, 288].map((a) => <circle key={a} cx={24 * Math.cos(a * Math.PI / 180)} cy={24 * Math.sin(a * Math.PI / 180)} r={9} fill={C.cream} />)}<circle r={6} fill={C.red} /></g>; })()}
      {pts.map((p, i) => { const [x, y] = P(p.lon, p.lat); const k = appear(p.step); const pulse = p.hi ? 1 + 0.25 * Math.sin(fr / 5) : 1;
        return <g key={i} opacity={k}><circle cx={x} cy={y} r={(p.hi ? 15 : 10) * pulse} fill={p.hi ? C.red : C.cream} stroke="#000" strokeWidth={3} />
          <text x={x + (p.dx ?? 20)} y={y + (p.dy ?? -16)} textAnchor={(p.dx ?? 20) < 0 ? "end" : "start"} style={{ ...DISPLAY, fontSize: p.hi ? 52 : 38, fill: p.hi ? C.red : C.cream, paintOrder: "stroke", stroke: "#000", strokeWidth: 8 } as any}>{p.n}</text></g>; })}
    </svg>
    {s.title && <div style={{ position: "absolute", top: 54, left: 0, right: 0, textAlign: "center", ...DISPLAY, fontSize: 64, color: C.cream, textShadow: "0 4px 20px #000" }}>{s.title}</div>}
  </AbsoluteFill>;
};
// ---- coded timeline
const Timeline: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame(); const items = s.items ?? []; const n = items.length; const up = s.upto ?? n - 1; const from = s.from ?? -1;
  const x = (i: number) => 260 + i * (1400 / (n - 1));
  const lineK = interpolate(fr, [0, 24], [from >= 0 ? (x(from) - 260) / 1400 : 0, (x(up) - 260) / 1400], clamp);
  return <AbsoluteFill style={{ background: C.ink, overflow: "hidden" }}><Paper s={{ ...s, bg: undefined }} />
    {s.title && <div style={{ position: "absolute", top: 90, left: 0, right: 0, textAlign: "center", ...DISPLAY, fontSize: 64, color: C.cream }}>{s.title}</div>}
    <div style={{ position: "absolute", left: 260, top: 520, width: 1400, height: 8, background: "#3d352d" }} />
    <div style={{ position: "absolute", left: 260, top: 520, width: 1400 * lineK, height: 8, background: C.red }} />
    {items.map((it, i) => { const shown = i <= up; const k = i <= from ? 1 : interpolate(fr, [6 + (i - from - 1) * 12, 16 + (i - from - 1) * 12], [0, 1], clamp); const cur = i === up;
      return <div key={i} style={{ position: "absolute", left: x(i) - 200, width: 400, top: 300, textAlign: "center", opacity: shown ? k : 0.18 }}>
        <div style={{ ...DISPLAY, fontSize: cur ? 70 : 56, lineHeight: 1.0, color: cur ? C.red : C.cream, height: 150, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>{it[0]}</div>
        <div style={{ width: cur ? 40 : 28, height: cur ? 40 : 28, borderRadius: 40, background: shown ? (cur ? C.red : C.cream) : "#3d352d", margin: `${cur ? 50 : 56}px auto 0`, border: "5px solid #000" }} />
        <div style={{ ...DISPLAY, fontSize: 40, lineHeight: 1.1, color: C.cream, marginTop: 36 }}>{it[1]}</div></div>; })}
  </AbsoluteFill>;
};
// ---- coded border-tent diagram (Sims Act workaround): film on the Canadian side, camera on the US side, frame-by-frame copy
const Tent: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame(); const step = s.step ?? 1; const k = step >= 2 ? 1 : interpolate(fr, [0, 18], [0, 1], clamp);
  const camK = step >= 2 ? 1 : interpolate(fr, [40, 55], [0, 1], clamp); const beam = step >= 2 ? 0.55 + 0.25 * Math.sin(fr / 3) : 0;
  return <AbsoluteFill style={{ background: C.sea, overflow: "hidden" }}>
    <svg width={1920} height={1080}>
      <rect x={0} y={0} width={1920} height={540} fill="#1d1916" /><rect x={0} y={540} width={1920} height={540} fill={C.land} />
      <line x1={0} y1={540} x2={1920} y2={540} stroke={C.red} strokeWidth={8} strokeDasharray="34 20" />
      <text x={110} y={300} style={{ ...DISPLAY, fontSize: 76, fill: C.cream } as any}>CANADA</text>
      <text x={110} y={820} style={{ ...DISPLAY, fontSize: 76, fill: C.cream } as any}>UNITED STATES</text>
      <text x={1810} y={520} textAnchor="end" style={{ ...DISPLAY, fontSize: 40, fill: C.red } as any}>THE BORDER</text>
      <g opacity={k}><path d="M760,250 L960,150 L1160,250 L1160,830 L760,830 Z" fill="none" stroke={C.cream} strokeWidth={8} strokeLinejoin="round" />
        <text x={1190} y={220} style={{ ...DISPLAY, fontSize: 46, fill: C.cream } as any}>ONE TENT</text></g>
      <g opacity={k} transform="translate(960,330)"><rect x={-130} y={-70} width={260} height={140} fill="#e8e0d0" stroke="#000" strokeWidth={5} /><text y={16} textAnchor="middle" style={{ ...DISPLAY, fontSize: 42, fill: "#111" } as any}>FILM PLAYS</text></g>
      <polygon points={`900,700 1020,700 1000,400 920,400`} fill={`rgba(243,238,228,${beam * 0.45})`} />
      <g opacity={camK} transform="translate(960,730)"><rect x={-70} y={-40} width={140} height={90} rx={10} fill="#111" stroke={C.cream} strokeWidth={6} /><circle cx={0} cy={-46} r={26} fill="#111" stroke={C.cream} strokeWidth={6} /><circle cx={0} cy={-46} r={10} fill={C.red} />
        <text x={240} y={20} style={{ ...DISPLAY, fontSize: 44, fill: C.cream } as any}>CAMERA COPIES IT</text></g>
    </svg>
    {s.title && <div style={{ position: "absolute", top: 40, left: 0, right: 0, textAlign: "center", ...DISPLAY, fontSize: 64, color: C.cream }}>{s.title}</div>}
  </AbsoluteFill>;
};
const Label: React.FC<{ text: string }> = ({ text }) => {
  const fr = useCurrentFrame(); const k = interpolate(fr, [4, 14], [0, 1], clamp);
  return <AbsoluteFill style={{ alignItems: "flex-start", justifyContent: "flex-start", padding: "56px 64px" }}>
    <div style={{ opacity: k, transform: `translateX(${(1 - k) * -30}px)`, borderLeft: `10px solid ${C.red}`, background: "rgba(10,9,8,.78)", padding: "10px 24px 12px 20px" }}>
      {text.split("\n").map((l, i) => <div key={i} style={{ ...DISPLAY, fontSize: i ? 40 : 50, lineHeight: 1.12, color: i ? C.red : C.cream }}>{l}</div>)}
    </div></AbsoluteFill>;
};
const Round: React.FC<{ r: string; dur: number }> = ({ r, dur }) => {
  const fr = useCurrentFrame(); let n = r;
  if (r.includes("-")) { const [x, y] = r.split("-").map(Number); n = String(Math.round(interpolate(fr, [0, Math.max(1, dur - 10)], [x, y], clamp))); }
  return <AbsoluteFill style={{ alignItems: "flex-end", justifyContent: "flex-start", padding: "56px 64px" }}>
    <div style={{ ...DISPLAY, fontSize: 46, color: C.cream, background: "rgba(10,9,8,.78)", padding: "8px 24px", borderRight: `10px solid ${C.red}` }}>ROUND <span style={{ color: C.red }}>{n}</span> OF 45</div></AbsoluteFill>;
};
const Over: React.FC<{ text: string }> = ({ text }) => {
  const fr = useCurrentFrame(); const sp = spring({ frame: fr, fps: FPS, config: { damping: 13, stiffness: 160 } });
  return <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 160 }}>
    <div style={{ ...DISPLAY, fontSize: 150, color: C.cream, background: "rgba(10,9,8,.72)", padding: "6px 50px", borderBottom: `12px solid ${C.red}`, transform: `scale(${interpolate(sp, [0, 1], [1.3, 1])})`, opacity: Math.min(1, fr / 5) }}>{text}</div></AbsoluteFill>;
};
type Wd = { w: string; s: number; e: number };
const words = (TL as any).words as Wd[];
const groups: Wd[][] = (() => { const out: Wd[][] = []; let cur: Wd[] = []; for (const w of words) { cur.push(w); if (cur.length >= 6 || /[.,!?:;…"”]$/.test(w.w)) { out.push(cur); cur = []; } } if (cur.length) out.push(cur); return out; })();
const Captions: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const i = groups.findIndex((g, k) => t >= g[0].s - 0.05 && t < Math.min(groups[k + 1]?.[0].s ?? 1e9, g[g.length - 1].e + 0.6));
  if (i < 0) return null;
  return <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 56 }}>
    <div style={{ ...DISPLAY, fontSize: 56, lineHeight: 1.12, maxWidth: 1500, textAlign: "center" }}>
      {groups[i].map((w, k) => <span key={k} style={{ color: t >= w.s - 0.03 && t < w.e + 0.05 ? C.red : "#fff", marginRight: 16, WebkitTextStroke: "3px #000", paintOrder: "stroke fill", textShadow: "0 4px 0 #000, 0 0 18px rgba(0,0,0,.9)" }}>{w.w}</span>)}
    </div></AbsoluteFill>;
};
const Subscribe: React.FC = () => {
  const fr = useCurrentFrame(); const sp = spring({ frame: fr, fps: FPS, config: { damping: 12, stiffness: 180 } });
  const out = interpolate(fr, [105, 120], [1, 0], clamp);
  return <AbsoluteFill style={{ alignItems: "flex-end", justifyContent: "flex-start", padding: "60px 70px" }}>
    <div style={{ ...DISPLAY, fontSize: 48, color: "#fff", background: C.red, padding: "14px 40px", borderRadius: 14, opacity: out, transform: `scale(${sp})`, boxShadow: "0 10px 30px rgba(0,0,0,.5)" }}>Subscribe</div>
  </AbsoluteFill>;
};
const Body: React.FC<{ s: Shot }> = ({ s }) => (s.kind === "comp" || s.kind === "small") ? <Comp s={s} /> : s.kind === "card" ? <Card s={s} /> : s.kind === "vid" ? <Vid s={s} /> : s.kind === "map" ? <MapShot s={s} />
  : s.kind === "tl" ? <Timeline s={s} /> : s.kind === "split" ? <Split s={s} /> : s.kind === "tent" ? <Tent s={s} /> : <Still s={s} />;
const Film: React.FC = () => {
  const tl = TL as any;
  return <AbsoluteFill style={{ background: C.ink }}>
    {(tl.shots as Shot[]).map((s, i) => <Sequence key={i} from={f(s.a)} durationInFrames={Math.max(1, f(s.b) - f(s.a))}>
      <Body s={s} />
      {(s.kind === "img" || s.kind === "comp" || s.kind === "small" || s.kind === "vid" || s.kind === "split") && <>
        <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 60%, rgba(6,4,2,.35) 100%)" }} />
        <AbsoluteFill style={{ pointerEvents: "none", background: "linear-gradient(rgba(0,0,0,0) 72%, rgba(0,0,0,.45) 100%)" }} /></>}
      {s.over && <Over text={s.over} />}
      {s.label && <Label text={s.label} />}
      {s.rnd && <Round r={s.rnd} dur={f(s.b) - f(s.a)} />}
    </Sequence>)}
    {(tl.subs as number[]).map((a, i) => <Sequence key={`p${i}`} from={f(a)} durationInFrames={120}><Subscribe /></Sequence>)}
    <Captions />
  </AbsoluteFill>;
};
const FilmSK = withSubkit(Film, TL);
registerRoot(() => <Composition id="Long" component={FilmSK} durationInFrames={f((TL as any).end)} fps={FPS} width={1920} height={1080} />);
