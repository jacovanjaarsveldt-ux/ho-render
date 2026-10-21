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
// route drawn dot by dot along a cubic bezier (sea routes on charts), with a head marker
const Route: React.FC<{ path: number[][]; t: number; at: number; end: number; c?: string; n?: number }> = ({ path, t, at, end, c = "#B3322B", n = 46 }) => {
  const p = interpolate(t, [at, end], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  if (p <= 0) return null;
  const k = Math.max(1, Math.round(n * p));
  return (
    <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      {Array.from({ length: k }).map((_, i) => { const [x, y] = bez(path, Math.min(p, i / (n - 1))); return <g key={i}><circle cx={x} cy={y} r={9} fill={C.ink} opacity={0.5} /><circle cx={x} cy={y} r={6} fill={c} /></g>; })}
      {(() => { const [x, y] = bez(path, p); return <g><circle cx={x} cy={y} r={17} fill={c} opacity={0.35} /><circle cx={x} cy={y} r={11} fill={c} stroke={C.ink} strokeWidth="4" /></g>; })()}
    </svg>
  );
};
// grid lines scoring themselves across a surface (ice being scored into blocks); cols/rows lines drawn one after another
const Grid: React.FC<{ g: any; t: number }> = ({ g, t }) => {
  const p = interpolate(t, [g.at, g.end], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  if (p <= 0) return null;
  const cols = g.cols ?? 8, rows = g.rows ?? 4, tot = cols + rows;
  const quad = (u: number, v: number) => { const sc = 1 - (g.persp ?? 0) * (1 - v); return [g.x + g.w / 2 + (u - 0.5) * g.w * sc + (v - 0.5) * (g.skew ?? 0), g.y + v * g.h]; };
  const lines: React.ReactElement[] = [];
  for (let i = 0; i <= cols; i++) { const q = interpolate(p * tot, [i, i + 1], [0, 1], clamp); if (q <= 0) continue; const [x0, y0] = quad(i / cols, 0), [x1, y1] = quad(i / cols, q); lines.push(<g key={`c${i}`}><line x1={x0} y1={y0} x2={x1} y2={y1} stroke={C.ink} strokeWidth="7" opacity={0.35} /><line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#3F6A8F" strokeWidth="3" /></g>); }
  for (let j = 0; j <= rows; j++) { const q = interpolate(p * tot, [cols + j, cols + j + 1], [0, 1], clamp); if (q <= 0) continue; const [x0, y0] = quad(0, j / rows), [x1, y1] = quad(q, j / rows); lines.push(<g key={`r${j}`}><line x1={x0} y1={y0} x2={x1} y2={y1} stroke={C.ink} strokeWidth="7" opacity={0.35} /><line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#2E4A66" strokeWidth="3.5" /></g>); }
  return <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>{lines}</svg>;
};
// ice blocks floating along a channel (rounded pale rectangles gliding from a to b, staggered)
const Slide: React.FC<{ s: any; t: number }> = ({ s, t }) => {
  const n = s.n ?? 4;
  return (
    <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      {Array.from({ length: n }).map((_, i) => {
        const a = s.at + i * (s.gap ?? 0.5); const u = interpolate(t, [a, a + (s.dur ?? 3)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) }); if (u <= 0) return null;
        const x = s.x0 + (s.x1 - s.x0) * u, y = s.y0 + (s.y1 - s.y0) * u + Math.sin(t * 2 + i) * 2; const op = interpolate(u, [0, 0.1, 0.9, 1], [0, 1, 1, 0], clamp);
        return <g key={i} transform={`translate(${x},${y})`} opacity={op}><rect x={-s.w / 2} y={-s.h / 2} width={s.w} height={s.h} rx={5} fill="#DDEBF3" stroke={C.ink} strokeWidth="3" /><rect x={-s.w / 2 + 5} y={-s.h / 2 + 4} width={s.w * 0.4} height={5} rx={2} fill="#fff" opacity={0.7} /></g>;
      })}
    </svg>
  );
};
const Label: React.FC<{ x: number; y: number; tx?: number; ty?: number; text: string; at: number; t: number; color?: string; size?: number; from?: string; until?: number }> = ({ x, y, tx, ty, text, at, t, color = C.gold, size = 30, from = "up", until }) => {
  const fo = until !== undefined ? interpolate(t, [until, until + 0.4], [1, 0], clamp) : 1;
  const p = interpolate(t, [at, at + 0.45], [0, 1], { ...clamp, easing: eo }) * fo;
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
      <rect x={x0 - 14} y={y - 14} width={b.pw ?? w + 28} height={h + 100} rx={10} fill="rgba(20,14,8,.78)" stroke={C.gold} strokeWidth="4" opacity={panel} />
      <rect x={x0} y={y} width={w * g} height={h} fill={b.color ?? "#3E2E26"} />
      {(b.marks ?? []).map((k: any, i: number) => <g key={`m${i}`} opacity={panel}><line x1={x0 + w * k.pos} y1={y - 22} x2={x0 + w * k.pos} y2={y + h + 18} stroke={C.ink} strokeWidth="11" opacity={0.5} /><line x1={x0 + w * k.pos} y1={y - 22} x2={x0 + w * k.pos} y2={y + h + 18} stroke={k.color ?? C.red} strokeWidth="6" /></g>)}
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
      <g transform={`translate(${w.cx},${w.cy}) scale(1,${w.sy ?? 1}) translate(${-w.cx},${-w.cy})`}>
      {(w.items ?? []).map((it: any, i: number) => {
        const on = interpolate(t, [it.at, it.at + 0.5], [0, 1], clamp); if (on <= 0) return null;
        const [x0, y0] = pt(it.a0, w.r), [x1, y1] = pt(it.a1, w.r), large = it.a1 - it.a0 > 6 ? 1 : 0;
        return <path key={i} d={`M${w.cx},${w.cy} L${x0},${y0} A${w.r},${w.r} 0 ${large} 1 ${x1},${y1} Z`} fill={it.color} opacity={0.62 * on} stroke={C.ink} strokeWidth="3" />;
      })}
      </g>
      {(w.items ?? []).map((it: any, i: number) => { const on = interpolate(t, [it.at, it.at + 0.5], [0, 1], clamp); if (on <= 0 || !it.text) return null; const [x, y] = pt((it.a0 + it.a1) / 2, w.r * 1.2); return <text key={i} x={x} y={y} textAnchor={x > w.cx ? "start" : "end"} fontFamily="Archivo" fontWeight={800} fontSize="30" fill={C.cream} stroke={C.ink} strokeWidth="7" paintOrder="stroke" opacity={on}>{it.text}</text>; })}
    </svg>
  );
};


// big running number in a paper plate (money counters): from -> to with ease, plus a pop-in
const Counter: React.FC<{ c: any; t: number }> = ({ c, t }) => {
  const pop = interpolate(t, [c.at - 0.3, c.at], [0, 1], clamp) * (c.until !== undefined ? interpolate(t, [c.until, c.until + 0.4], [1, 0], clamp) : 1);
  if (pop <= 0) return null;
  const v = Math.round(interpolate(t, [c.at, c.end], [c.from ?? 0, c.to], { ...clamp, easing: Easing.inOut(Easing.quad) }));
  const w = c.w ?? 620, h = c.h ?? 150;
  return (
    <div style={{ position: "absolute", left: c.x - w / 2, top: c.y - h / 2, width: w, height: h, opacity: pop, transform: `scale(${0.9 + 0.1 * pop})`, borderRadius: 12, background: "rgba(20,14,8,.86)", border: `4px solid ${C.gold}`, boxShadow: "0 8px 22px rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Archivo", fontWeight: 800, fontSize: c.size ?? 84, color: C.cream, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
      {c.prefix ?? ""}{v.toLocaleString("en-US")}{c.suffix ?? ""}
    </div>
  );
};


// ---- added for the Fugger long (History's Billionaires "fortune meter" and friends); new optional cfg keys only: tubes, crowns, inks, movers, ingots ----
// glass tubes that fill with stacked gold: {x, top, bottom, w, levels: [[seconds, fill 0..1], ...]} (eased between the points)
const Tubes: React.FC<{ b: any; t: number; fr: number }> = ({ b, t, fr }) => {
  const lv: number[][] = b.levels ?? [[0, 0]];
  let v = lv[0][1];
  if (t >= lv[lv.length - 1][0]) v = lv[lv.length - 1][1];
  else for (let i = 0; i < lv.length - 1; i++) if (t >= lv[i][0] && t < lv[i + 1][0]) v = lv[i][1] + (lv[i + 1][1] - lv[i][1]) * interpolate(t, [lv[i][0], lv[i + 1][0]], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const w = b.w ?? 120, x0 = b.x - w / 2, H = b.bottom - b.top, fh = H * v, y = b.bottom - fh, id = `tb${b.id ?? 0}`;
  const rows = Math.floor(fh / 15);
  return (
    <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" x2="1"><stop offset="0" stopColor="#8A6420" /><stop offset="0.35" stopColor="#F2D58A" /><stop offset="0.7" stopColor="#C9973A" /><stop offset="1" stopColor="#7A5518" /></linearGradient>
        <clipPath id={`${id}c`}><rect x={x0} y={b.top} width={w} height={H} rx={14} /></clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <rect x={x0} y={y} width={w} height={fh + 2} fill={`url(#${id}g)`} opacity={0.96} />
        {Array.from({ length: rows }).map((_, i) => <line key={i} x1={x0} x2={x0 + w} y1={b.bottom - 15 * (i + 1)} y2={b.bottom - 15 * (i + 1)} stroke="#5A3F10" strokeWidth={2.5} opacity={0.4} />)}
        {fh > 3 && <ellipse cx={b.x} cy={y} rx={w / 2 - 4} ry={7} fill="#FFE9A8" opacity={0.85 + 0.1 * Math.sin(fr / 5)} />}
      </g>
      <rect x={x0 + 8} y={b.top + 10} width={10} height={Math.max(10, H - 24)} rx={5} fill="#fff" opacity={0.18} />
      <rect x={x0 + w - 20} y={b.top + 16} width={5} height={Math.max(10, H - 40)} rx={3} fill="#fff" opacity={0.1} />
    </svg>
  );
};
// a small painted crown that drops onto the scale pan and bounces: {x, y (landing), at, size}
const CrownDrop: React.FC<{ k: any; t: number }> = ({ k, t }) => {
  const u = interpolate(t, [k.at, k.at + 0.55], [0, 1], clamp);
  if (u <= 0) return null;
  const bounce = interpolate(t, [k.at + 0.55, k.at + 0.78, k.at + 1.0], [0, -16, 0], clamp);
  const y = k.y - (1 - u * u) * 360 + bounce, s = k.size ?? 1, flash = interpolate(t, [k.at + 0.5, k.at + 0.7, k.at + 1.6], [0, 1, 0], clamp);
  return (
    <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <defs><linearGradient id="crG" x1="0" x2="1"><stop offset="0" stopColor="#B88A2E" /><stop offset="0.45" stopColor="#F6DC94" /><stop offset="1" stopColor="#9A7120" /></linearGradient></defs>
      <circle cx={k.x} cy={k.y - 20} r={130 * flash + 1} fill="rgba(255,226,140,.45)" opacity={flash} />
      <g transform={`translate(${k.x},${y}) scale(${s})`} opacity={interpolate(u, [0, 0.15], [0, 1], clamp)}>
        <path d="M-52,-12 Q0,-62 52,-12 Z" fill="#8F1D24" stroke={C.ink} strokeWidth="4" />
        <path d="M-60,2 L-60,-48 L-32,-24 L0,-60 L32,-24 L60,-48 L60,2 Z" fill="url(#crG)" stroke={C.ink} strokeWidth="5" strokeLinejoin="round" />
        <rect x="-60" y="-4" width="120" height="26" rx="5" fill="url(#crG)" stroke={C.ink} strokeWidth="5" />
        <circle cx="-34" cy="9" r="6" fill="#B3322B" stroke={C.ink} strokeWidth="2.5" /><circle cx="0" cy="9" r="7" fill="#3E6FB0" stroke={C.ink} strokeWidth="2.5" /><circle cx="34" cy="9" r="6" fill="#4E7A3A" stroke={C.ink} strokeWidth="2.5" />
        <circle cx="-60" cy="-50" r="6" fill="#F6EBD0" stroke={C.ink} strokeWidth="2.5" /><circle cx="0" cy="-62" r="7" fill="#F6EBD0" stroke={C.ink} strokeWidth="2.5" /><circle cx="60" cy="-50" r="6" fill="#F6EBD0" stroke={C.ink} strokeWidth="2.5" />
      </g>
    </svg>
  );
};
// handwriting that writes itself across a skewed page: {quad: [TL, TR, BR, BL] in the page's corners, lines, at, end, u0, v0, v1}; each line is a run of "words" of looped pen strokes with gaps
const Ink: React.FC<{ k: any; t: number }> = ({ k, t }) => {
  const [TL, TR, BR, BL] = k.quad as number[][]; const n = k.lines ?? 10;
  const p = interpolate(t, [k.at, k.end], [0, n], { ...clamp, easing: Easing.inOut(Easing.sin) });
  const pt = (u: number, v: number) => { const a = [TL[0] + (TR[0] - TL[0]) * u, TL[1] + (TR[1] - TL[1]) * u], b = [BL[0] + (BR[0] - BL[0]) * u, BL[1] + (BR[1] - BL[1]) * u]; return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v]; };
  const rnd = (i: number, j: number) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };
  const lineD = (i: number) => {
    const v = (k.v0 ?? 0.1) + ((k.v1 ?? 0.86) - (k.v0 ?? 0.1)) * (i / Math.max(1, n - 1)), end = i === n - 1 ? 0.45 : 0.82 + 0.08 * rnd(i, 1); let u = k.u0 ?? 0.09, d = "", w = 0;
    while (u < (k.u0 ?? 0.09) + end) {
      const len = 0.03 + 0.07 * rnd(i, w + 3), m = Math.max(6, Math.round(len * 220)); w++;
      for (let j = 0; j <= m; j++) {
        const q = j / m, uu = u + len * q, ph = j * 0.95 + rnd(i, w) * 6, amp = 0.0075 + 0.0075 * rnd(i, w * 7 + Math.floor(j / 3));
        const [x, y] = pt(uu, v + amp * Math.sin(ph) * 1.2 - (Math.sin(ph * 0.5) > 0.85 ? 0.018 : 0));
        d += `${j ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
      }
      u += len + 0.012 + 0.014 * rnd(i, w + 11);
    }
    return d;
  };
  return (
    <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      {Array.from({ length: n }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, p - i)); if (fill <= 0) return null;
        return <path key={i} d={lineD(i)} pathLength={1} fill="none" stroke="#2A1A0E" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 1" strokeDashoffset={1 - fill} opacity={0.85} />;
      })}
    </svg>
  );
};
// small things travelling along a bezier path: items [{kind: "letter" | "coin", path, at, dur, n, gap, hold}]
const Movers: React.FC<{ m: any; t: number }> = ({ m, t }) => (
  <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
    <defs><radialGradient id="mvCoin" cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#F2D58A" /><stop offset="0.7" stopColor="#C9973A" /><stop offset="1" stopColor="#8A6420" /></radialGradient></defs>
    {(m.items ?? []).map((it: any, i: number) => Array.from({ length: it.n ?? 1 }).map((_, k) => {
      const a = it.at + k * (it.gap ?? 0.3), u = interpolate(t, [a, a + (it.dur ?? 2)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) });
      if (u <= 0 || (u >= 1 && !it.hold)) return null;
      const [x, y] = bez(it.path, u), op = interpolate(u, [0, 0.06, 0.9, 1], [0, 1, 1, it.hold ? 1 : 0], clamp), tilt = Math.sin(t * 3 + k) * 6;
      return it.kind === "letter"
        ? <g key={`${i}-${k}`} transform={`translate(${x},${y}) rotate(${tilt - 8}) scale(${it.s ?? 1})`} opacity={op}><rect x="-26" y="-18" width="52" height="36" rx="3" fill="#EBDBB4" stroke={C.ink} strokeWidth="3.5" /><path d="M-26,-18 L0,4 L26,-18 M-26,18 L-4,0 M26,18 L4,0" fill="none" stroke="#A58F62" strokeWidth="2.5" /><circle cx="0" cy="3" r="8" fill="#B3322B" stroke={C.ink} strokeWidth="2.5" /></g>
        : <g key={`${i}-${k}`} transform={`translate(${x},${y}) scale(${it.s ?? 1})`} opacity={op}><ellipse rx="15" ry="9" fill="url(#mvCoin)" stroke={C.ink} strokeWidth="2.5" /><ellipse rx="9" ry="5" fill="none" stroke="#8A6420" strokeWidth="1.5" /></g>;
    }))}
  </svg>
);
// pyramid of gold ingots that stacks up one by one: {x (centre), y (base), w, h, rows: [4,3,2,1], at, end}
const Ingots: React.FC<{ g: any; t: number }> = ({ g, t }) => {
  const rows: number[] = g.rows ?? [4, 3, 2, 1], total = rows.reduce((a, b) => a + b, 0), w = g.w ?? 84, h = g.h ?? 40, gap = 7;
  const prog = interpolate(t, [g.at, g.end], [0, total], { ...clamp, easing: Easing.inOut(Easing.quad) });
  let idx = 0;
  return (
    <svg width={1600} height={894} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <defs><linearGradient id="ingG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#F6DC94" /><stop offset="0.5" stopColor="#D2A23F" /><stop offset="1" stopColor="#8A6420" /></linearGradient></defs>
      {rows.map((cnt, r) => Array.from({ length: cnt }).map((_, c) => {
        const my = idx++, on = interpolate(prog, [my, my + 0.9], [0, 1], clamp); if (on <= 0) return null;
        const cx = g.x + (c - (cnt - 1) / 2) * (w + gap), cy = g.y - r * (h + gap) - (1 - on) * 60;
        return <g key={`${r}-${c}`} transform={`translate(${cx},${cy})`} opacity={on}><path d={`M${-w / 2 + 8},${-h} L${w / 2 - 8},${-h} L${w / 2},0 L${-w / 2},0 Z`} fill="url(#ingG)" stroke={C.ink} strokeWidth="4" strokeLinejoin="round" /><path d={`M${-w / 2 + 14},${-h + 7} L${w / 2 - 14},${-h + 7}`} stroke="#FFF1BD" strokeWidth="4" strokeLinecap="round" opacity={0.7} /></g>;
      }))}
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
          {(cfg.routes ?? []).map((g: any, i: number) => <Route key={i} t={t} {...g} />)}
          {(cfg.grids ?? []).map((g: any, i: number) => <Grid key={i} g={g} t={t} />)}
          {(cfg.slides ?? []).map((g: any, i: number) => <Slide key={i} s={g} t={t} />)}
        </div>
        <div style={layer(1.45)}>
          {(cfg.fills ?? []).map((g: any, i: number) => <Fills key={i} f={{ id: i, ...g }} t={t} fr={fr} />)}
          {(cfg.bars ?? []).map((g: any, i: number) => <Bar key={i} b={g} t={t} fr={fr} />)}
          {(cfg.coins ?? []).map((g: any, i: number) => <Coins key={i} c={g} t={t} fr={fr} />)}
          {(cfg.wedges ?? []).map((g: any, i: number) => <Wedges key={i} w={g} t={t} fr={fr} />)}
          {(cfg.stamps ?? []).map((g: any, i: number) => <Stamp key={i} t={t} {...g} />)}
          {(cfg.counters ?? []).map((g: any, i: number) => <Counter key={i} c={g} t={t} />)}
          {(cfg.tubes ?? []).map((g: any, i: number) => <Tubes key={i} b={{ id: i, ...g }} t={t} fr={fr} />)}
          {(cfg.inks ?? []).map((g: any, i: number) => <Ink key={i} k={g} t={t} />)}
          {(cfg.movers ?? []).map((g: any, i: number) => <Movers key={i} m={g} t={t} />)}
          {(cfg.ingots ?? []).map((g: any, i: number) => <Ingots key={i} g={g} t={t} />)}
          {(cfg.crowns ?? []).map((g: any, i: number) => <CrownDrop key={i} k={g} t={t} />)}
        </div>
        <div style={layer(1.6)}>{(cfg.labels ?? []).map((g: any, i: number) => <Label key={i} t={t} {...g} />)}</div>
      </div>
    </AbsoluteFill>
  );
};
