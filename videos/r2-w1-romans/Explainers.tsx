import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, Easing } from "remotion";

// Generic explainer scene: a PAINTED base (no text in the image) + coded animated layers (labels on leader lines, flowing arrows,
// fire glow, drifting smoke, growing bars, filling vessels, stamped items, counters) + slow camera drift with parallax.
// Config comes from timeline.json (shot.cfg); every "at" is seconds since the scene start. Painting space is 1600x894 (scaled 1.2).
const FPS = 30;
const C = { gold: "#E7C27A", cream: "#F4EBD8", ink: "#1B120A", brown: "#3A2A1A", red: "#B3322B", orange: "#E0762B", blue: "#4F86C6", green: "#4E7A3A", mid: "#6B5235" };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const eo = Easing.out(Easing.cubic);
const bez = (p: number[][], u: number) => { const m = 1 - u; return [0, 1].map((k) => m * m * m * p[0][k] + 3 * m * m * u * p[1][k] + 3 * m * u * u * p[2][k] + u * u * u * p[3][k]); };

const Glow: React.FC<{ x: number; y: number; r: number; fr: number; k?: number; c?: string; at?: number; t: number }> = ({ x, y, r, fr, k = 1, c = "255,170,70", at = 0, t }) => {
  const f = 0.55 + 0.18 * Math.sin(fr / 3.1) + 0.1 * Math.sin(fr / 1.3 + 1) + 0.06 * Math.sin(fr / 0.8);
  const on = interpolate(t, [at, at + 0.8], [0, 1], clamp);
  return <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", mixBlendMode: "screen", opacity: Math.min(1, f * k) * on, background: `radial-gradient(circle, rgba(${c},.85) 0%, rgba(${c},.35) 32%, rgba(${c},0) 70%)` }} />;
};
const Smoke: React.FC<{ path: number[][]; fr: number; t: number; n?: number; speed?: number; size?: number; at?: number; tone?: string }> = ({ path, fr, t, n = 10, speed = 0.005, size = 24, at = 0, tone = "150,146,138" }) => {
  const show = interpolate(t, [at, at + 1.2], [0, 1], clamp);
  return <>{Array.from({ length: n }).map((_, i) => {
    const u = ((fr * speed + i / n) % 1); const [x, y] = bez(path, u); const sw = Math.sin(fr / 24 + i * 1.7) * 10 * u;
    const op = Math.sin(Math.PI * Math.min(1, u * 1.05)) * 0.5 * show; const sz = size * (1.2 + u * 3.2);
    return <div key={i} style={{ position: "absolute", left: x + sw - sz / 2, top: y - sz / 2, width: sz, height: sz, borderRadius: "50%", background: `radial-gradient(circle, rgba(${tone},.7), rgba(${tone},0) 70%)`, opacity: op }} />;
  })}</>;
};
const Flow: React.FC<{ path: number[][]; fr: number; t: number; c: string; at: number; w?: number; speed?: number; dash?: string }> = ({ path, fr, t, c, at, w = 9, speed = 2.2, dash = "26 18" }) => {
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
const Label: React.FC<{ x: number; y: number; tx?: number; ty?: number; text: string; at: number; t: number; color?: string; size?: number; from?: string }> = ({ x, y, tx, ty, text, at, t, color = C.gold, size = 30, from = "up" }) => {
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
// big ink text that stamps onto the painted parchment (countdown numbers, dates, STOPPED)
const Stamp: React.FC<{ x: number; y: number; text: string; at: number; t: number; size?: number; color?: string; box?: boolean; rot?: number; sub?: string }> = ({ x, y, text, at, t, size = 130, color = C.brown, box = false, rot = 0, sub }) => {
  const p = interpolate(t, [at, at + 0.16], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  if (p <= 0) return null;
  const ring = interpolate(t, [at, at + 0.5], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) rotate(${rot}deg) scale(${1.6 - 0.6 * p})`, opacity: p, textAlign: "center", whiteSpace: "nowrap" }}>
      <div style={{ display: "inline-block", fontFamily: "Archivo", fontWeight: 800, fontSize: size, lineHeight: 1.05, letterSpacing: "0.02em", color, padding: box ? "4px 26px" : 0, border: box ? `${Math.max(6, size / 12)}px solid ${color}` : "none", textShadow: "1px 2px 0 rgba(58,42,26,.3), 0 0 5px rgba(58,42,26,.3)" }}>{text}</div>
      {sub && <div style={{ fontFamily: "Archivo", fontWeight: 800, fontSize: Math.max(24, size / 4), color: C.mid, marginTop: 6, opacity: ring }}>{sub}</div>}
    </div>
  );
};
// growing horizontal bar with ticks and flags (timelines)
const Bar: React.FC<{ b: any; t: number; fr: number }> = ({ b, t, fr }) => {
  const g = interpolate(t, [b.at, b.end], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const panel = interpolate(t, [b.at - 0.5, b.at], [0, 1], clamp);
  const x0 = b.x, w = b.w, y = b.y, h = b.h ?? 56;
  return (
    <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <rect x={x0 - 14} y={y - 14} width={w + 28} height={h + 100} rx={10} fill="rgba(20,14,8,.78)" stroke={C.gold} strokeWidth="4" opacity={panel} />
      <rect x={x0} y={y} width={w * g} height={h} fill={b.color ?? "#3E2E26"} />
      {(b.ticks ?? []).map((k: any, i: number) => <g key={i} opacity={panel}><path d={`M${x0 + w * k.pos},${y + h + 14} v14`} stroke={C.cream} strokeWidth="4" /><text x={x0 + w * k.pos} y={y + h + 60} textAnchor="middle" fontFamily="Archivo" fontWeight={800} fontSize="28" fill={C.cream}>{k.text}</text></g>)}
      {b.label && <text x={x0 + 14} y={y + h / 2 + 11} fontFamily="Archivo" fontWeight={800} fontSize="32" fill={C.cream} letterSpacing="2" opacity={interpolate(t, [b.at + 0.4, b.at + 1.2], [0, 1], clamp)}>{b.label}</text>}
    </svg>
  );
};
// row of vessels (jugs or bottles) that fill one after another, with an optional running number
const Fills: React.FC<{ f: any; t: number; fr: number }> = ({ f, t, fr }) => {
  const n = f.n, gap = f.w / n;
  const prog = interpolate(t, [f.at, f.end], [0, n], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const val = f.to !== undefined ? Math.round(interpolate(t, [f.at, f.end], [f.from ?? 0, f.to], { ...clamp, easing: Easing.inOut(Easing.quad) })) : null;
  const pop = interpolate(t, [f.at - 0.4, f.at], [0, 1], clamp);
  return (
    <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: pop }}>
      <defs>
        <linearGradient id="vg" x1="0" x2="1"><stop offset="0" stopColor="#7A5530" /><stop offset="0.45" stopColor="#B88A55" /><stop offset="1" stopColor="#6A4826" /></linearGradient>
      </defs>
      {Array.from({ length: n }).map((_, i) => {
        const cx = f.x + gap * (i + 0.5); const fill = Math.max(0, Math.min(1, prog - i));
        const bw = f.vw ?? 54, bh = f.vh ?? 120; const top = f.y - bh;
        const liquid = f.liquid ?? (f.kind === "bottle" ? "#7FD08A" : "#A31F26");
        const body = f.kind === "bottle"
          ? `M${cx - bw / 2},${f.y} L${cx - bw / 2},${top + 36} Q${cx - bw / 2},${top + 20} ${cx - 10},${top + 14} L${cx - 10},${top - 8} L${cx + 10},${top - 8} L${cx + 10},${top + 14} Q${cx + bw / 2},${top + 20} ${cx + bw / 2},${top + 36} L${cx + bw / 2},${f.y} Z`
          : `M${cx - bw / 2},${f.y} Q${cx - bw / 2 - 12},${top + bh / 2} ${cx - bw / 3},${top + 18} L${cx - bw / 4},${top} L${cx + bw / 4},${top} L${cx + bw / 3},${top + 18} Q${cx + bw / 2 + 12},${top + bh / 2} ${cx + bw / 2},${f.y} Z`;
        return (
          <g key={i}>
            <clipPath id={`vc${f.id ?? 0}${i}`}><path d={body} /></clipPath>
            <path d={body} fill="rgba(244,235,216,.28)" stroke={C.ink} strokeWidth="5" />
            <rect x={cx - bw} y={f.y - bh * fill} width={bw * 2} height={bh * fill + 2} fill={liquid} opacity={0.92} clipPath={`url(#vc${f.id ?? 0}${i})`} />
            <path d={body} fill="none" stroke={C.ink} strokeWidth="5" />
            <path d={`M${cx - bw / 4},${f.y - 8} L${cx - bw / 4},${top + bh * 0.3}`} stroke="#fff" strokeWidth="4" opacity={0.28} strokeLinecap="round" />
            {f.labels && f.labels[i] && <text x={cx} y={top - 22} textAnchor="middle" fontFamily="Archivo" fontWeight={800} fontSize="30" fill={C.cream} stroke={C.ink} strokeWidth="6" paintOrder="stroke" opacity={interpolate(prog, [i + 0.4, i + 0.9], [0, 1], clamp)}>{f.labels[i]}</text>}
          </g>
        );
      })}
      {val !== null && <g><rect x={f.nx - 260} y={f.ny - 62} width={520} height={86} rx={10} fill="rgba(20,14,8,.82)" stroke={C.gold} strokeWidth="4" /><text x={f.nx} y={f.ny + 4} textAnchor="middle" fontFamily="Archivo" fontWeight={800} fontSize="58" fill={C.cream}>{f.prefix ?? ""}{val.toLocaleString("en-US")}{f.suffix ?? ""}</text></g>}
    </svg>
  );
};


// grid of coins that appear one by one (coin comparison cards)
const Coins: React.FC<{ c: any; t: number; fr: number }> = ({ c, t }) => {
  const n = c.n ?? 100, cols = c.cols ?? 10, r = c.r ?? 22;
  const prog = interpolate(t, [c.at, c.end ?? c.at + 0.6], [0, n], { ...clamp, easing: Easing.inOut(Easing.quad) });
  return (
    <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <defs><radialGradient id="coinG" cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#F2D58A" /><stop offset="0.7" stopColor="#C9973A" /><stop offset="1" stopColor="#8A6420" /></radialGradient></defs>
      {Array.from({ length: n }).map((_, i) => {
        const on = interpolate(prog, [i, i + 0.7], [0, 1], clamp); if (on <= 0) return null;
        const cx = c.x + (i % cols) * (r * 2.15) + (c.dx ?? 0), cy = c.y + Math.floor(i / cols) * (r * 0.62 * (c.squash ?? 1)) * -1;
        return <g key={i} transform={`translate(${cx},${cy + (1 - on) * -30})`} opacity={on}><ellipse rx={r} ry={r * 0.55} fill="url(#coinG)" stroke={C.ink} strokeWidth="3" /><ellipse rx={r * 0.6} ry={r * 0.3} fill="none" stroke="#8A6420" strokeWidth="2" /></g>;
      })}
    </svg>
  );
};
// coloured wedges of a dial lighting in order (a0..a1 are hours 0..12, clockwise from the top)
const Wedges: React.FC<{ w: any; t: number; fr: number }> = ({ w, t }) => {
  const pt = (a: number, rad: number) => [w.cx + Math.sin((a / 12) * Math.PI * 2) * rad, w.cy - Math.cos((a / 12) * Math.PI * 2) * rad];
  return (
    <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      {(w.items ?? []).map((it: any, i: number) => {
        const on = interpolate(t, [it.at, it.at + 0.5], [0, 1], clamp); if (on <= 0) return null;
        const [x0, y0] = pt(it.a0, w.r), [x1, y1] = pt(it.a1, w.r), large = it.a1 - it.a0 > 6 ? 1 : 0;
        return <path key={i} d={`M${w.cx},${w.cy} L${x0},${y0} A${w.r},${w.r} 0 ${large} 1 ${x1},${y1} Z`} fill={it.color} opacity={0.62 * on} stroke={C.ink} strokeWidth="3" />;
      })}
      {(w.items ?? []).map((it: any, i: number) => { const on = interpolate(t, [it.at, it.at + 0.5], [0, 1], clamp); if (on <= 0 || !it.text) return null; const [x, y] = pt((it.a0 + it.a1) / 2, w.r * 1.2); return <text key={i} x={x} y={y} textAnchor={x > w.cx ? "start" : "end"} fontFamily="Archivo" fontWeight={800} fontSize="30" fill={C.cream} stroke={C.ink} strokeWidth="7" paintOrder="stroke" opacity={on}>{it.text}</text>; })}
    </svg>
  );
};

export const Explainer: React.FC<{ s: any }> = ({ s }) => {
  const cfg = s.cfg ?? {};
  const fr = useCurrentFrame(); const dur = Math.max(1, (s.b - s.a) * FPS);
  const prog = interpolate(fr, [0, dur], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) });
  const t = fr / FPS;
  const z0 = cfg.z0 ?? 1.0, z1 = cfg.z1 ?? 1.045, dx = cfg.dx ?? -26, dy = cfg.dy ?? -6;
  const layer = (m: number): React.CSSProperties => ({ position: "absolute", left: 0, top: 0, width: 1600, height: 894, transformOrigin: "0 0", transform: `scale(1.2) translate(${dx * prog * m}px, ${dy * prog * m}px)` });
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: C.ink }}>
      <div style={{ position: "absolute", inset: 0, transformOrigin: cfg.origin ?? "50% 50%", transform: `scale(${z0 + (z1 - z0) * prog})` }}>
        <div style={layer(1)}><Img src={staticFile(cfg.base)} style={{ width: 1600, height: 894 }} /></div>
        <div style={layer(1.0)}>{(cfg.glows ?? []).map((g: any, i: number) => <Glow key={i} fr={fr + i * 7} t={t} {...g} />)}</div>
        <div style={layer(1.25)}>
          {(cfg.smokes ?? []).map((g: any, i: number) => <Smoke key={i} fr={fr} t={t} {...g} />)}
          {(cfg.flows ?? []).map((g: any, i: number) => <Flow key={i} fr={fr} t={t} {...g} />)}
        </div>
        <div style={layer(1.45)}>
          {(cfg.fills ?? []).map((g: any, i: number) => <Fills key={i} f={{ id: i, ...g }} t={t} fr={fr} />)}
          {(cfg.bars ?? []).map((g: any, i: number) => <Bar key={i} b={g} t={t} fr={fr} />)}
          {(cfg.coins ?? []).map((g: any, i: number) => <Coins key={i} c={g} t={t} fr={fr} />)}
          {(cfg.wedges ?? []).map((g: any, i: number) => <Wedges key={i} w={g} t={t} fr={fr} />)}
          {(cfg.stamps ?? []).map((g: any, i: number) => <Stamp key={i} t={t} {...g} />)}
        </div>
        <div style={layer(1.6)}>{(cfg.labels ?? []).map((g: any, i: number) => <Label key={i} t={t} {...g} />)}</div>
      </div>
    </AbsoluteFill>
  );
};
