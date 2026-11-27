import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, interpolate, spring, Easing, continueRender, delayRender, registerRoot, Composition } from "remotion";
import TL from "./timeline.json";

// SportsRoom long 3 (racing), 16:9 1920x1080. Built by tools/build_tl.py from the voice word timings and shotlist.py. Based on the Olympics long's LongSR.tsx.
// Shot kinds: img (full-frame still, one slow eased move), comp (whole picture on a blurred copy, for portraits and small files), film (archive clip, pre-cut),
// card (text card, words from the script), count (countdown card), expl (animated explainer: map / stat / timeline / diagram; spec in tools/explainers.py).
// Captions: Anton, uppercase, bottom, SportsRoom red #DD1118 on the spoken word. Audio is mixed separately (mix.py) and muxed in render-long-sync.yml.
const FPS = 30;
const f = (s: number) => Math.round(s * FPS);
const C = { red: "#DD1118", ink: "#0E0C0A", cream: "#F3EEE4", gold: "#E8B04A" };
const h = delayRender("fonts");
Promise.all([["Anton", "Anton.woff2", "400"], ["Archivo", "Archivo-900.woff2", "900"]].map(([n, file, w]) => new FontFace(n, `url(${staticFile(file)}) format("woff2")`, { weight: w }).load().then((ff) => (document.fonts as any).add(ff)))).then(() => continueRender(h));
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const DISPLAY: React.CSSProperties = { fontFamily: "Anton, Impact, sans-serif", textTransform: "uppercase", letterSpacing: "0.01em" };
type Shot = { a: number; b: number; kind: string; src?: string; cam?: string; o?: string; dir?: number; text?: string; num?: string; title?: string; bg?: string; bgv?: string; lbl?: string; spec?: any };

const move = (cam: string | undefined, t: number, dir = 1, amp = 1) => {
  let scale = 1, tx = 0;
  if (cam === "push") scale = 1 + 0.05 * amp * t; else if (cam === "pull") scale = 1 + 0.05 * amp * (1 - t); else if (cam === "pan") { scale = 1.07; tx = dir * (t - 0.5) * 80 * amp; }
  return { scale, tx };
};
const useT = (s: Shot) => { const fr = useCurrentFrame(); return interpolate(fr, [0, f(s.b - s.a)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) }); };
const Lbl: React.FC<{ text?: string }> = ({ text }) => {
  const fr = useCurrentFrame(); if (!text) return null;
  return <AbsoluteFill style={{ alignItems: "flex-start", justifyContent: "flex-start", padding: "56px 64px" }}>
    <div style={{ ...DISPLAY, fontSize: 46, color: "#fff", background: C.red, padding: "8px 22px", opacity: interpolate(fr, [4, 12], [0, 1], clamp), transform: `translateX(${interpolate(fr, [4, 14], [-30, 0], { ...clamp, easing: Easing.out(Easing.cubic) })}px)`, boxShadow: "0 8px 24px rgba(0,0,0,.5)" }}>{text}</div>
  </AbsoluteFill>;
};
const Still: React.FC<{ s: Shot }> = ({ s }) => {
  const t = useT(s); const { scale, tx } = move(s.cam, t, s.dir);
  return <AbsoluteFill style={{ overflow: "hidden", background: C.ink }}>
    <Img src={staticFile(s.src!)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: s.o ?? "50% 50%", transformOrigin: s.o ?? "50% 50%", transform: `translateX(${tx}px) scale(${scale})` }} />
    <Lbl text={s.lbl} />
  </AbsoluteFill>;
};
const Comp: React.FC<{ s: Shot }> = ({ s }) => {
  const t = useT(s); const { scale, tx } = move(s.cam === "pan" ? "push" : s.cam, t, s.dir, 0.8);
  return <AbsoluteFill style={{ overflow: "hidden", background: C.ink }}>
    <Img src={staticFile(s.src!)} style={{ position: "absolute", inset: -60, width: "calc(100% + 120px)", height: "calc(100% + 120px)", objectFit: "cover", filter: "blur(38px) brightness(0.42) saturate(0.8)" }} />
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <Img src={staticFile(s.src!)} style={{ width: "92%", height: "100%", objectFit: "contain", transformOrigin: s.o ?? "50% 50%", transform: `translateX(${tx}px) scale(${scale})`, filter: "drop-shadow(0 18px 40px rgba(0,0,0,.65))" }} />
    </AbsoluteFill>
    <Lbl text={s.lbl} />
  </AbsoluteFill>;
};
const Clip: React.FC<{ s: Shot; dim?: number }> = ({ s, dim }) => <AbsoluteFill style={{ background: C.ink, overflow: "hidden" }}>
  <OffthreadVideo src={staticFile(s.src!)} muted style={{ width: "100%", height: "100%", objectFit: "cover", filter: dim ? `brightness(${1 - dim}) blur(2px)` : "contrast(1.05)" }} />
</AbsoluteFill>;
const Paper: React.FC<{ s: Shot }> = ({ s }) => s.bgv
  ? <Clip s={{ ...s, src: s.bgv }} dim={0.62} />
  : s.bg
  ? <Img src={staticFile(s.bg)} style={{ position: "absolute", inset: -60, width: "calc(100% + 120px)", height: "calc(100% + 120px)", objectFit: "cover", filter: "blur(30px) brightness(0.3) saturate(0.6)" }} />
  : <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 42%, #2a2520 0%, #14110e 65%, #0a0908 100%)" }} />;
const Card: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame(); const sp = spring({ frame: fr, fps: FPS, config: { damping: 14, stiffness: 170 } });
  const lines = (s.text ?? "").split("\n");
  return <AbsoluteFill style={{ background: C.ink, overflow: "hidden" }}><Paper s={s} />
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 90 }}>
      <div style={{ width: interpolate(sp, [0, 1], [0, 220]), height: 10, background: C.red, marginBottom: 34 }} />
      {lines.map((l, i) => <div key={i} style={{ ...DISPLAY, fontSize: lines.length > 2 ? 92 : 118, lineHeight: 1.04, color: i === 0 ? C.cream : C.red, textAlign: "center", maxWidth: 1600, opacity: interpolate(fr, [i * 4, i * 4 + 8], [0, 1], clamp), transform: `translateY(${interpolate(sp, [0, 1], [30, 0])}px)`, textShadow: "0 6px 30px rgba(0,0,0,.6)" }}>{l}</div>)}
    </AbsoluteFill></AbsoluteFill>;
};
const Count: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame(); const sp = spring({ frame: fr, fps: FPS, config: { damping: 12, stiffness: 200 } });
  return <AbsoluteFill style={{ background: C.ink, overflow: "hidden" }}><Paper s={s} />
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 80 }}>
      <div style={{ ...DISPLAY, fontSize: 430, lineHeight: 0.9, color: C.red, transform: `scale(${interpolate(sp, [0, 1], [1.5, 1])})`, opacity: Math.min(1, fr / 4), textShadow: "0 12px 50px rgba(0,0,0,.7)" }}>{s.num}</div>
      <div style={{ ...DISPLAY, fontSize: 84, color: C.cream, marginTop: 10, opacity: interpolate(fr, [6, 14], [0, 1], clamp), letterSpacing: "0.03em", textShadow: "0 6px 30px rgba(0,0,0,.7)" }}>{s.title}</div>
    </AbsoluteFill></AbsoluteFill>;
};

// ---------- explainers ----------
type Pt = number[];
const plen = (d: Pt[]) => { let L = 0; for (let i = 1; i < d.length; i++) L += Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]); return L; };
const pstr = (d: Pt[]) => d.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
const atKeys = (keys: number[][], t: number) => { // keys [[t,x,y],...]
  if (t <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const k0 = keys[i - 1], k1 = keys[i]; const u = Easing.inOut(Easing.quad)((t - k0[0]) / Math.max(1e-6, k1[0] - k0[0])); return [k0[1] + (k1[1] - k0[1]) * u, k0[2] + (k1[2] - k0[2]) * u]; }
  const k = keys[keys.length - 1]; return [k[1], k[2]];
};
const Label: React.FC<{ x: number; y: number; text: string; anchor?: string; op: number; red?: boolean; plain?: boolean; size?: number }> = ({ x, y, text, anchor = "r", op, red, plain, size = 40 }) => {
  const off = 26; const st: React.CSSProperties = { position: "absolute", ...DISPLAY, fontSize: size, color: plain ? "rgba(243,238,228,.55)" : "#fff", whiteSpace: "nowrap", opacity: op, letterSpacing: plain ? "0.18em" : "0.02em" };
  if (!plain) Object.assign(st, { background: red ? C.red : "rgba(14,12,10,.88)", padding: "6px 16px", border: red ? "none" : "2px solid rgba(243,238,228,.35)" });
  const tr = anchor === "r" ? `translate(${off}px,-50%)` : anchor === "l" ? `translate(calc(-100% - ${off}px),-50%)` : anchor === "t" ? `translate(-50%,calc(-100% - ${off}px))` : anchor === "b" ? `translate(-50%,${off}px)` : "translate(-50%,-50%)";
  return <div style={{ ...st, left: x, top: y, transform: `${tr} translateY(${(1 - op) * 10}px)` }}>{text}</div>;
};
const fmtN = (n: number, comma?: boolean) => comma ? Math.round(n).toLocaleString("en-US") : String(Math.round(n));
const Expl: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame(); const D = Math.max(1, f(s.b - s.a)); const T = fr / D; const sec = fr / FPS;
  const sp: any = s.spec ?? {};
  const k = (at: number, dur = 0.06) => at > 1.5 ? 0 : interpolate(T, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const prog = (at: number, dur: number) => dur <= 0 ? (T >= at ? 1 : 0) : interpolate(T, [at, at + dur], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) });
  const zoom = 1 + 0.035 * T;
  const base = sp.base;
  const layers: React.ReactNode[] = [];
  if (sp.bgv) layers.push(<Clip key="bgv" s={{ ...s, src: sp.bgv }} dim={0.6} />);
  else if (base && base.fit === "band") layers.push(<AbsoluteFill key="bg" style={{ background: "#0b0d10" }}><Img src={staticFile(base.src)} style={{ position: "absolute", left: 0, top: base.y, width: 1920, height: base.h, filter: `brightness(${1 - (base.dim ?? 0)}) saturate(0.7)` }} /></AbsoluteFill>);
  else if (base) layers.push(<Img key="bg" src={staticFile(base.src)} style={{ position: "absolute", inset: 0, width: 1920, height: 1080, objectFit: "cover", filter: base.dim ? `brightness(${1 - base.dim}) blur(1px)` : undefined }} />);
  else layers.push(<AbsoluteFill key="bg" style={{ background: "radial-gradient(ellipse at 50% 42%, #2a2520 0%, #14110e 65%, #0a0908 100%)" }} />);
  if (sp.snow) {
    const flakes = Array.from({ length: 140 }, (_, i) => { const r = (n: number) => { const x = Math.sin(i * 9301 + n * 49297) * 233280; return x - Math.floor(x); };
      const y = ((r(1) * 1180 + sec * (40 + r(2) * 60)) % 1180) - 50; const x = r(3) * 1920 + Math.sin(sec * (0.6 + r(4)) + i) * 18; return <circle key={i} cx={x} cy={y} r={1.5 + r(5) * 3} fill="#fff" opacity={0.25 + r(6) * 0.45} />; });
    layers.push(<svg key="snow" width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>{flakes}</svg>);
  }
  if (sp.diagram === "pit") {
    const lab = { ...DISPLAY, fontSize: 34, letterSpacing: "0.2em" } as any;
    layers.push(<svg key="pit" width={1920} height={1080} style={{ position: "absolute", inset: 0, transformOrigin: "50% 54%", transform: "scale(1.7)" }}>
      <rect x={0} y={0} width={1920} height={1080} fill="#16130f" />
      <rect x={0} y={400} width={1920} height={110} fill="#3b3227" /><text x={140} y={470} fill="rgba(243,238,228,.55)" style={lab}>EARTH BANK</text>
      <rect x={0} y={510} width={1920} height={130} fill="#2b2b2d" /><line x1={0} x2={1920} y1={575} y2={575} stroke="rgba(255,255,255,.25)" strokeWidth={3} strokeDasharray="40 30" />
      <rect x={0} y={640} width={1920} height={70} fill="#222224" /><line x1={0} x2={1920} y1={642} y2={642} stroke="rgba(255,255,255,.5)" strokeWidth={3} />
      <rect x={0} y={710} width={1920} height={70} fill="#33302b" />{Array.from({ length: 16 }, (_, i) => <line key={i} x1={i * 125} x2={i * 125} y1={710} y2={780} stroke="rgba(255,255,255,.18)" strokeWidth={3} />)}
      <text x={140} y={760} fill="rgba(243,238,228,.55)" style={lab}>PITS</text>
      <text x={1780} y={590} fill="rgba(243,238,228,.35)" textAnchor="end" style={{ ...DISPLAY, fontSize: 30, letterSpacing: "0.2em" } as any}>{"DIRECTION OF RACE  >>"}</text>
    </svg>);
  }
  if (sp.timeline) {
    const tl = sp.timeline; const y = 560;
    const x1 = tl.grow ? interpolate(T, [tl.grow.at, tl.grow.at + tl.grow.dur], [tl.nodes[2].x, tl.nodes[3].x], clamp) : tl.nodes[0].x + (tl.nodes[2].x - tl.nodes[0].x) * prog(tl.line_at, tl.line_dur);
    layers.push(<svg key="tl" width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      <line x1={tl.nodes[0].x} x2={x1} y1={y} y2={y} stroke={C.cream} strokeWidth={8} strokeLinecap="round" />
      {tl.nodes.map((n: any, i: number) => n.span ? null : <circle key={i} cx={n.x} cy={y} r={22 * k(n.at, 0.05)} fill={n.hl ? C.red : C.cream} stroke="#0e0c0a" strokeWidth={5} />)}
    </svg>);
    tl.nodes.forEach((n: any, i: number) => { const o = k(n.at, 0.07); if (!o) return;
      layers.push(<div key={`tn${i}`} style={{ position: "absolute", left: n.x, top: y - 120, transform: "translateX(-50%)", textAlign: "center", opacity: o, whiteSpace: "nowrap" }}>
        <div style={{ ...DISPLAY, fontSize: 46, color: n.hl ? C.red : C.gold, height: 60 }}>{n.top}</div></div>);
      layers.push(<div key={`tb${i}`} style={{ position: "absolute", left: n.x, top: y + 48, transform: `translateX(-50%) translateY(${(1 - o) * 14}px)`, textAlign: "center", opacity: o, width: 420 }}>
        <div style={{ ...DISPLAY, fontSize: 52, lineHeight: 1.05, color: n.hl ? "#fff" : C.cream, background: n.hl ? C.red : "transparent", padding: n.hl ? "6px 14px" : 0, display: "inline-block" }}>{n.bot}</div></div>);
    });
  }
  const mapEls: React.ReactNode[] = [];
  (sp.paths ?? []).forEach((p: any, i: number) => {
    const L = plen(p.d); const pr = prog(p.at, p.dur); if (pr <= 0) return;
    const op = (p.opacity ?? 1) * (p.fade !== undefined ? interpolate(T, [0, 0.1], [1, p.fade], clamp) : 1);
    const id = `m${s.a}_${i}`.replace(".", "_");
    if (p.dash || p.rail) {
      mapEls.push(<g key={`p${i}`} opacity={op}><defs><mask id={id} maskUnits="userSpaceOnUse" x={-200} y={-200} width={2320} height={1480}><path d={pstr(p.d)} stroke="#fff" strokeWidth={p.w * 3 + 24} fill="none" strokeDasharray={L} strokeDashoffset={L * (1 - pr)} strokeLinecap="round" strokeLinejoin="round" /></mask></defs>
        <g mask={`url(#${id})`}>{p.rail ? <><path d={pstr(p.d)} stroke={p.color} strokeWidth={p.w} fill="none" /><path d={pstr(p.d)} stroke={p.color} strokeWidth={p.w * 3} fill="none" strokeDasharray="3 18" /></>
          : <path d={pstr(p.d)} stroke={p.color} strokeWidth={p.w} fill="none" strokeDasharray={`${p.w * 2.4} ${p.w * 1.8}`} strokeLinecap="round" />}</g></g>);
    } else {
      mapEls.push(<g key={`p${i}`} opacity={op}>
        <path d={pstr(p.d)} stroke={p.bricks ? "#4a1e12" : "rgba(0,0,0,.55)"} strokeWidth={p.w + 8} fill="none" strokeDasharray={L} strokeDashoffset={L * (1 - pr)} strokeLinecap={p.bricks ? "butt" : "round"} strokeLinejoin="round" />
        <path d={pstr(p.d)} stroke={p.color} strokeWidth={p.w} fill="none" strokeDasharray={L} strokeDashoffset={L * (1 - pr)} strokeLinecap={p.bricks ? "butt" : "round"} strokeLinejoin="round" />
        {p.bricks && pr >= 1 ? <path d={pstr(p.d)} stroke="#2a120a" strokeWidth={p.w} fill="none" strokeDasharray="2 16" /> : null}
      </g>);
    }
  });
  (sp.bridges ?? []).forEach((b: any, i: number) => { const o = k(b.at, 0.05); if (o) mapEls.push(<g key={`br${i}`} opacity={o}><line x1={b.x - 16} x2={b.x + 16} y1={b.y - 22} y2={b.y - 22} stroke={C.cream} strokeWidth={5} /><line x1={b.x - 16} x2={b.x + 16} y1={b.y + 22} y2={b.y + 22} stroke={C.cream} strokeWidth={5} /></g>); });
  (sp.pins ?? []).forEach((p: any, i: number) => { const o = k(p.at, 0.06); if (o && !p.plain) mapEls.push(<g key={`pin${i}`}><circle cx={p.x} cy={p.y} r={30 * o * (1 + 0.25 * Math.sin(sec * 4))} fill="none" stroke={p.red ? C.red : C.cream} strokeWidth={3} opacity={0.5 * o} /><circle cx={p.x} cy={p.y} r={11 * o} fill={p.red ? C.red : C.cream} stroke="#0e0c0a" strokeWidth={4} /></g>); });
  if (sp.stop) { const o = k(sp.stop.at, 0.05); if (o) mapEls.push(<g key="stop" opacity={o}><rect x={sp.stop.x - 30} y={sp.stop.y - 30} width={60} height={60} fill={C.red} transform={`rotate(45 ${sp.stop.x} ${sp.stop.y})`} /><text x={sp.stop.x} y={sp.stop.y + 13} fill="#fff" textAnchor="middle" style={{ ...DISPLAY, fontSize: 36 } as any}>X</text></g>); }
  const drops: any[] = sp.drops ?? [];
  (sp.movers ?? []).forEach((m: any, i: number) => {
    const [x, y] = atKeys(m.keys, T); const appear = k(m.keys[0][0], 0.03); if (!appear) return;
    const dr = drops.find((d) => d.i === i); const gone = dr ? k(dr.at, 0.05) : 0;
    const burst = m.burst !== undefined ? k(m.burst, 0.08) : 0;
    if (m.plane) { mapEls.push(<g key={`mv${i}`} transform={`translate(${x},${y})`} opacity={appear}><circle r={24} fill={C.red} stroke="#fff" strokeWidth={4} /><path d="M-14,0 L14,0 M0,-12 L0,12 M-6,-6 L6,6" stroke="#fff" strokeWidth={3} /></g>); return; }
    const big = sp.diagram === "pit";
    const w = big ? 120 : 56, hh = big ? 56 : 36;
    if (burst > 0) {
      for (let q = 0; q < 9; q++) { const a = q * 0.7 + 0.3; const dist = 30 + 90 * burst * (0.6 + (q % 3) * 0.3); const px = x + Math.cos(a) * dist, py = y + Math.sin(a) * dist * 0.6;
        mapEls.push(<rect key={`fr${i}${q}`} x={px - 10} y={py - 7} width={20} height={14} fill={m.color} opacity={1 - burst * 0.3} transform={`rotate(${q * 40 + burst * 120} ${px} ${py})`} />); }
      return;
    }
    mapEls.push(<g key={`mv${i}`} transform={`translate(${x},${y})`} opacity={appear * (1 - gone * 0.75)}>
      <rect x={-w / 2} y={-hh / 2} width={w} height={hh} rx={hh / 2.6} fill={gone ? "#55514a" : m.color} stroke="#0e0c0a" strokeWidth={4} />
      <text x={0} y={big ? 15 : 10} textAnchor="middle" fill={m.ink ? "#111" : "#fff"} style={{ ...DISPLAY, fontSize: big ? 42 : 28 } as any}>{m.num}</text>
      {gone ? <path d={`M${-w / 2 - 6},${-hh / 2 - 6} L${w / 2 + 6},${hh / 2 + 6} M${w / 2 + 6},${-hh / 2 - 6} L${-w / 2 - 6},${hh / 2 + 6}`} stroke={C.red} strokeWidth={6} opacity={gone} /> : null}
      {big && m.label ? <text x={0} y={-hh / 2 - 14} textAnchor="middle" fill={C.cream} style={{ ...DISPLAY, fontSize: 30 } as any}>{m.label}</text> : null}
    </g>);
  });
  (sp.flash ?? []).forEach((fl: any, i: number) => { const o = interpolate(T, [fl.at, fl.at + 0.03, fl.at + 0.12], [0, 1, 0], clamp); if (o) mapEls.push(<circle key={`fl${i}`} cx={fl.x} cy={fl.y} r={60 + 80 * o} fill="#fff" opacity={o * 0.8} />); });
  const zoomStyle: React.CSSProperties = { position: "absolute", inset: 0, transformOrigin: "50% 50%", transform: sp.diagram === "pit" ? "scale(1.7)" : sp.diagram || sp.timeline || sp.rows || sp.end || sp.tile ? undefined : `scale(${zoom})`, ...(sp.diagram === "pit" ? { transformOrigin: "50% 54%" } : {}) };
  const labelEls = (sp.pins ?? []).map((p: any, i: number) => { const o = k(p.at, 0.06); return o ? <Label key={`lb${i}`} x={p.x} y={p.y} text={p.label} anchor={p.anchor} op={o} red={p.red} plain={p.plain} size={p.plain ? 44 : 40} /> : null; });
  let rowsEl: React.ReactNode = null;
  if (sp.rows) {
    const R = sp.rows; const lh = R.size * (R.gap ?? 1.3);
    rowsEl = <>{R.items.map((it: any, i: number) => {
      const o = k(it.at, 0.06); if (!o) return null;
      const mv = it.move ? prog(it.move.at, 0.12) : 0; const yy = R.y + (i + (it.move ? (it.move.to - i) * mv : 0)) * lh;
      const st = it.strike !== undefined ? prog(it.strike, 0.07) : 0;
      const promoted = it.move && mv > 0.5;
      return <div key={i} style={{ position: "absolute", left: R.x, top: yy, transform: `translateX(-50%) translateY(${(1 - o) * 20}px)`, opacity: o * (st > 0 ? 1 - 0.45 * st : 1), whiteSpace: "nowrap", zIndex: promoted ? 2 : 1 }}>
        <div style={{ ...DISPLAY, position: "relative", fontSize: R.size, lineHeight: 1.1, color: promoted ? "#fff" : (it.color ?? C.cream), background: promoted ? C.red : "transparent", padding: promoted ? "0 24px" : 0, textShadow: "0 6px 26px rgba(0,0,0,.6)" }}>
          {promoted ? it.move.t : it.t}<div style={{ position: "absolute", left: -12, top: "52%", height: R.size * 0.11, width: `calc(${st * 100}% + ${st * 24}px)`, background: C.red }} /></div></div>;
    })}</>;
  }
  let panelEl: React.ReactNode = null;
  if (sp.panel) panelEl = <div style={{ position: "absolute", left: 90, top: 90, width: 760, height: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <Img src={staticFile(sp.panel.src)} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", transform: `scale(${1 + 0.04 * T})`, filter: "drop-shadow(0 18px 40px rgba(0,0,0,.7))" }} /></div>;
  let counterEl: React.ReactNode = null;
  if (sp.counter) { const c = sp.counter; const v = c.start + (c.end - c.start) * prog(c.at, c.dur); const o = k(c.at, 0.04);
    counterEl = <div style={{ position: "absolute", left: c.x, top: c.y, transform: "translate(-50%,-50%)", opacity: o, textAlign: "center", background: c.box ? "rgba(14,12,10,.85)" : "transparent", padding: c.box ? "10px 40px" : 0, whiteSpace: "nowrap" }}>
      <span style={{ ...DISPLAY, fontSize: c.size, color: C.red, textShadow: "0 8px 30px rgba(0,0,0,.6)" }}>{(c.prefix ?? "") + (c.year ? String(Math.round(v)) : fmtN(v, c.comma))}</span>
      {c.suffix ? <span style={{ ...DISPLAY, fontSize: c.size * 0.42, color: C.cream, marginLeft: 22 }}>{c.suffix}</span> : null}</div>; }
  const tagEls = (sp.tags ?? []).map((tg: any, i: number) => { const o = k(tg.at, 0.06); return o ? <div key={`tg${i}`} style={{ position: "absolute", left: tg.x, top: tg.y, transform: `translate(-50%,-50%) scale(${0.9 + 0.1 * o})`, opacity: o, ...DISPLAY, fontSize: 44, color: "#fff", background: C.red, padding: "6px 22px", whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,.5)" }}>{tg.text}</div> : null; });
  let tileEl: React.ReactNode = null;
  if (sp.tile) { const o = spring({ frame: fr - f(sp.tile.at * (s.b - s.a)), fps: FPS, config: { damping: 14, stiffness: 150 } });
    tileEl = <div style={{ position: "absolute", left: 960, top: 470, transform: `translate(-50%,-50%) scale(${0.85 + 0.15 * o})`, opacity: o, textAlign: "center" }}>
      <div style={{ ...DISPLAY, fontSize: 54, color: "#fff", background: C.red, display: "inline-block", padding: "6px 26px", marginBottom: 18 }}>{sp.tile.label}</div>
      <Img src={staticFile(sp.tile.src)} style={{ width: 960, height: 540, display: "block", border: "6px solid #F3EEE4", boxShadow: "0 20px 60px rgba(0,0,0,.7)" }} /></div>; }
  let endEl: React.ReactNode = null;
  if (sp.end) { endEl = <>
    <div style={{ position: "absolute", left: 120, top: 150 }}>{sp.end.races.map((r: string, i: number) => { const o = k(0.02 + i * 0.03, 0.05); return <div key={i} style={{ ...DISPLAY, fontSize: 50, lineHeight: 1.32, color: i === 7 ? C.red : C.cream, opacity: o, transform: `translateX(${(1 - o) * -30}px)` }}>{r}</div>; })}</div>
    <div style={{ position: "absolute", right: 110, top: 190, opacity: k(0.05, 0.08), textAlign: "center" }}>
      <div style={{ ...DISPLAY, fontSize: 46, color: "#fff", background: C.red, display: "inline-block", padding: "6px 24px", marginBottom: 16 }}>NEXT UP</div>
      <Img src={staticFile(sp.end.tile)} style={{ width: 800, height: 450, display: "block", border: "6px solid #F3EEE4" }} /></div></>; }
  return <AbsoluteFill style={{ background: C.ink, overflow: "hidden" }}>
    {layers}
    <AbsoluteFill style={zoomStyle}>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>{mapEls}</svg>
      {labelEls}
    </AbsoluteFill>
    {panelEl}{rowsEl}{counterEl}{tagEls}{tileEl}{endEl}
  </AbsoluteFill>;
};

type Wd = { w: string; s: number; e: number };
const words = (TL as any).words as Wd[];
const groups: Wd[][] = (() => { const out: Wd[][] = []; let cur: Wd[] = []; for (const w of words) { cur.push(w); if (cur.length >= 6 || /[.,!?:;…"”]$/.test(w.w)) { out.push(cur); cur = []; } } if (cur.length) out.push(cur); return out; })();
const Captions: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const i = groups.findIndex((g, k) => t >= g[0].s - 0.05 && t < Math.min(groups[k + 1]?.[0].s ?? 1e9, g[g.length - 1].e + 0.6));
  if (i < 0) return null;
  return <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 64 }}>
    <div style={{ ...DISPLAY, fontSize: 58, lineHeight: 1.12, maxWidth: 1500, textAlign: "center" }}>
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
const Film: React.FC = () => {
  const tl = TL as any;
  return <AbsoluteFill style={{ background: C.ink }}>
    {(tl.shots as Shot[]).map((s, i) => <Sequence key={i} from={f(s.a)} durationInFrames={Math.max(1, f(s.b) - f(s.a))}>
      {s.kind === "comp" ? <Comp s={s} /> : s.kind === "card" ? <Card s={s} /> : s.kind === "count" ? <Count s={s} /> : s.kind === "film" ? <Clip s={s} /> : s.kind === "expl" ? <Expl s={s} /> : <Still s={s} />}
    </Sequence>)}
    <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 60%, rgba(6,4,2,.35) 100%)" }} />
    <AbsoluteFill style={{ pointerEvents: "none", background: "linear-gradient(rgba(0,0,0,0) 72%, rgba(0,0,0,.45) 100%)" }} />
    {(tl.subs as number[]).map((a, i) => <Sequence key={`p${i}`} from={f(a)} durationInFrames={120}><Subscribe /></Sequence>)}
    <Captions />
  </AbsoluteFill>;
};
registerRoot(() => <Composition id="Long" component={Film} durationInFrames={f((TL as any).end)} fps={FPS} width={1920} height={1080} />);
