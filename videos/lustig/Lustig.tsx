import React from "react";
import {
  AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame,
  interpolate, Easing, continueRender, delayRender, registerRoot, Composition,
} from "remotion";
import TL from "./timeline.json";
import words from "./words.json";

// Lustig long (the man who sold the Eiffel Tower) · 16:9 · Nano Banana 2 Lite stills + free code graphics (maps, number cards, timelines).
// Every cut starts on its narration cue (build_tl.py). Music: one quiet bed ~18 dB under the voice, silent at the two big moments.

const FPS = 30;
const f = (s: number) => Math.round(s * FPS);
const DUR = f(TL.end);
const C = { gold: "#E7C27A", cream: "#F4EBD8", ink: "#0D0C0A", red: "#E10600", paper: "#EADBB8", brown: "#3A2A1A" };

const h = delayRender("fonts");
Promise.all([
  ["Cinzel", "Cinzel-900.woff2", "900"], ["Archivo", "Archivo-800.woff2", "800"],
].map(([n, file, w]) => new FontFace(n, `url(${staticFile(file)}) format("woff2")`, { weight: w }).load().then((ff) => (document.fonts as any).add(ff)))).then(() => continueRender(h));

type Marker = { xy: number[]; label: string; at: number; c: string; left?: boolean };
type Shot = {
  a: number; b: number; kind: string; src?: string; z?: number[]; o?: string;
  view?: number[][]; markers?: Marker[]; route?: number[][]; routeSub?: string;
  lines?: string[]; sub?: string; stamp?: string; style?: string;
  left?: string[]; right?: string[]; lt?: string; rt?: string; items?: string[]; bar?: boolean;
};

const ease = Easing.inOut(Easing.sin);

// Free motion on stills: slow push/pull + drift, alternating so consecutive stills never move the same way.
const Still: React.FC<{ s: Shot; i: number }> = ({ s, i }) => {
  const fr = useCurrentFrame();
  const t = interpolate(fr, [0, f(s.b - s.a)], [0, 1], { extrapolateRight: "clamp", easing: ease });
  const [z0, z1] = s.z ?? (i % 2 ? [1.04, 1.13] : [1.13, 1.04]);
  const drift = (i % 3 - 1) * 22;
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: C.ink }}>
      <Img src={staticFile(s.src!)} style={{ width: "100%", height: "100%", objectFit: "cover", transformOrigin: s.o ?? "50% 50%", transform: `translateX(${drift * (t - 0.5)}px) scale(${z0 + (z1 - z0) * t})` }} />
    </AbsoluteFill>
  );
};

// Map: coastline render with a camera move, pinned markers that pop in, and an optional route that draws itself.
const MapShot: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame();
  const [from, to] = s.view ?? [[960, 543, 1], [960, 543, 1]];
  const t = interpolate(fr, [0, f(s.b - s.a)], [0, 1], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const [cx, cy, z] = [0, 1, 2].map((k) => from[k] + (to[k] - from[k]) * t);
  const tx = 960 - cx * z, ty = 540 - cy * z;
  const route = s.route ?? [];
  const len = route.reduce((acc, p, k) => (k ? acc + Math.hypot(p[0] - route[k - 1][0], p[1] - route[k - 1][1]) : 0), 0);
  const draw = interpolate(fr, [f(0.3), f(Math.min(4, s.b - s.a - 0.5))], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#40687C" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1086, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
        <Img src={staticFile(s.src!)} style={{ width: 1920, height: 1086 }} />
        {route.length > 1 && (
          <svg width={1920} height={1086} style={{ position: "absolute", left: 0, top: 0 }}>
            <path d={route.map((p, k) => `${k ? "L" : "M"}${p[0]},${p[1]}`).join(" ")} fill="none" stroke={C.red} strokeWidth={7 / z} strokeDasharray={len} strokeDashoffset={len * (1 - draw)} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {(s.markers ?? []).map((m, k) => {
          const since = fr - f(m.at);
          if (since < 0) return null;
          const pop = interpolate(since, [0, 8], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.back(2)) });
          const pulse = 1 + 0.35 * ((since % 40) / 40);
          return (
            <div key={k} style={{ position: "absolute", left: m.xy[0], top: m.xy[1], transform: `translate(-50%,-50%) scale(${pop / z})` }}>
              <div style={{ position: "absolute", left: -22 * pulse, top: -22 * pulse, width: 44 * pulse, height: 44 * pulse, borderRadius: "50%", border: `3px solid ${m.c}`, opacity: 1.35 - pulse }} />
              <div style={{ position: "absolute", left: -11, top: -11, width: 22, height: 22, borderRadius: "50%", background: m.c, border: "3px solid #fff", boxShadow: "0 2px 8px rgba(0,0,0,.5)" }} />
              <div style={{ position: "absolute", ...(m.left ? { right: 26 } : { left: 26 }), top: -24, whiteSpace: "nowrap", fontFamily: "Archivo", fontWeight: 800, fontSize: 34, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", background: "rgba(13,12,10,.78)", padding: "4px 14px", borderLeft: `5px solid ${m.c}` }}>{m.label}</div>
            </div>
          );
        })}
      </div>
      {s.routeSub && draw > 0.98 && (
        <div style={{ position: "absolute", left: 80, top: 70, fontFamily: "Archivo", fontWeight: 800, fontSize: 44, color: "#fff", background: "rgba(13,12,10,.78)", padding: "8px 22px", borderLeft: `6px solid ${C.red}` }}>{s.routeSub}</div>
      )}
    </AbsoluteFill>
  );
};

// Paper card background shared by cards, vs and timelines.
const Paper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, #F1E4C4 0%, ${C.paper} 55%, #C9B48A 100%)`, alignItems: "center", justifyContent: "center" }}>
    <AbsoluteFill style={{ border: `14px solid ${C.brown}`, boxShadow: `inset 0 0 0 6px ${C.paper}, inset 0 0 0 10px ${C.brown}` }} />
    {children}
  </AbsoluteFill>
);

const Card: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame();
  const lines = s.lines ?? [];
  const quote = s.style === "quote";
  return (
    <Paper>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: s.style === "list" ? 18 : 6 }}>
        {lines.map((l, k) => {
          const d = k * 7;
          const p = interpolate(fr - d, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.6)) });
          const arrow = l === "TO" || l === "OR";
          return (
            <div key={k} style={{ opacity: p, transform: `translateY(${(1 - p) * 30}px) scale(${0.9 + 0.1 * p})`, fontFamily: quote ? "Cinzel" : "Archivo", fontWeight: quote ? 900 : 800, fontSize: arrow ? 70 : quote ? 92 : lines.length > 2 ? 104 : 130, lineHeight: 1.08, color: arrow ? C.red : C.brown, textAlign: "center", letterSpacing: quote ? "0.02em" : "0.01em", maxWidth: 1600 }}>{l}</div>
          );
        })}
        {s.sub && <div style={{ marginTop: 26, fontFamily: "Archivo", fontWeight: 800, fontSize: 38, color: "#6B5235", opacity: interpolate(fr, [12, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>{s.sub}</div>}
      </div>
      {s.stamp && (() => {
        const p = interpolate(fr, [f(1.1), f(1.1) + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(3)) });
        return <div style={{ position: "absolute", right: 170, bottom: 150, transform: `rotate(-12deg) scale(${2.2 - 1.2 * p})`, opacity: p, fontFamily: "Archivo", fontWeight: 800, fontSize: 64, color: C.red, border: `8px solid ${C.red}`, padding: "6px 26px", letterSpacing: "0.06em" }}>{s.stamp}</div>;
      })()}
    </Paper>
  );
};

const Vs: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame();
  const col = (title: string, lines: string[], c: string, d: number) => {
    const p = interpolate(fr - d, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.5)) });
    return (
      <div style={{ width: 760, opacity: p, transform: `translateY(${(1 - p) * 40}px)`, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontFamily: "Archivo", fontWeight: 800, fontSize: 44, color: "#fff", background: c, padding: "6px 26px", letterSpacing: "0.08em", marginBottom: 24 }}>{title}</div>
        {lines.map((l, k) => <div key={k} style={{ fontFamily: "Archivo", fontWeight: 800, fontSize: 96, color: C.brown, lineHeight: 1.1 }}>{l}</div>)}
      </div>
    );
  };
  return (
    <Paper>
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        {col(s.lt!, s.left!, "#2F5D9E", 0)}
        <div style={{ fontFamily: "Cinzel", fontWeight: 900, fontSize: 90, color: C.red }}>VS</div>
        {col(s.rt!, s.right!, C.red, 14)}
      </div>
    </Paper>
  );
};

const Timeline: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame();
  const items = s.items ?? [];
  const dur = f(s.b - s.a);
  const grow = interpolate(fr, [6, Math.min(dur - 10, f(3.5))], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  return (
    <Paper>
      <div style={{ position: "relative", width: 1560, height: 360 }}>
        <div style={{ position: "absolute", left: items.some((x) => x.length > 8) ? 230 : 0, top: 170, height: 14, width: (items.some((x) => x.length > 8) ? 1100 : 1560) * grow, background: s.bar ? C.red : C.brown, borderRadius: 7 }} />
        {items.map((it, k) => {
          const pad = items.some((x) => x.length > 8) ? 230 : 0;
          const x = items.length === 1 ? 780 : pad + ((1560 - 2 * pad) * k) / (items.length - 1);
          const show = grow >= (items.length === 1 ? 0 : k / (items.length - 1)) - 0.001;
          const long = it.length > 8;
          return (
            <div key={k} style={{ position: "absolute", left: x, top: 150, transform: "translateX(-50%)", opacity: show ? 1 : 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 54, height: 54, borderRadius: "50%", background: C.paper, border: `10px solid ${C.brown}` }} />
              <div style={{ position: "absolute", top: long && k % 2 ? -78 : 80, fontFamily: "Archivo", fontWeight: 800, fontSize: long ? 44 : 52, color: C.brown, whiteSpace: "nowrap" }}>{it}</div>
            </div>
          );
        })}
        {s.sub && <div style={{ position: "absolute", left: 0, right: 0, top: 0, textAlign: "center", fontFamily: "Cinzel", fontWeight: 900, fontSize: 84, color: s.bar ? C.red : C.brown, opacity: s.bar ? grow : 1 }}>{s.sub}</div>}
      </div>
    </Paper>
  );
};

const Overlay: React.FC<{ t: string; s: string; dur: number }> = ({ t, s, dur }) => {
  const fr = useCurrentFrame();
  const op = interpolate(fr, [0, 8, dur - 8, dur], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (s === "title" || s === "chapter") {
    const sc = interpolate(fr, [0, dur], [1.06, 1.0]);
    const big = s === "title";
    return (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: big ? "center" : "flex-start", paddingTop: big ? 0 : 90, opacity: op, background: big ? "radial-gradient(ellipse at center, rgba(0,0,0,.45), rgba(0,0,0,0) 60%)" : "linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,0) 40%)" }}>
        <div style={{ transform: `scale(${sc})`, fontFamily: "Cinzel", fontWeight: 900, fontSize: big ? 150 : 78, textAlign: "center", maxWidth: 1700, color: C.cream, letterSpacing: "0.1em", textShadow: "0 6px 30px rgba(0,0,0,.8)" }}>{t}</div>
        <div style={{ width: big ? 560 : 420, height: 3, marginTop: 10, background: `linear-gradient(90deg, transparent, ${C.gold}, transparent)` }} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ padding: "64px 80px", opacity: op }}>
      <div style={{ alignSelf: "flex-start", fontFamily: "Archivo", fontWeight: 800, fontSize: 38, color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em", background: "rgba(13,12,10,.72)", padding: "8px 20px", borderLeft: `6px solid ${C.gold}` }}>{t}</div>
    </AbsoluteFill>
  );
};

// Small subtitles at the bottom: short phrases, current word in gold.
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
        {groups[i].map((w, k) => (
          <span key={k} style={{ color: t >= w.s - 0.03 && t < w.e + 0.05 ? C.gold : "#fff", marginRight: 12 }}>{w.w}</span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// Music: one 200 s bed, looped with 2 s crossfades, ~18 dB under the voice, faded to silence inside musicOff windows.
const BED = 199.9, XF = 2;
const OFF = (TL as any).musicOff as number[][];
const MUSIC_VOL = 0.083;
const offGain = (sec: number) => {
  let g = 1;
  for (const [a, b] of OFF) g = Math.min(g, interpolate(sec, [a - 1.2, a, b, b + 2.0], [1, 0, 0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return g;
};
const Music: React.FC = () => {
  const loops: number[] = [];
  for (let st = 0; st < TL.end; st += BED - XF) loops.push(st);
  return (
    <>
      {loops.map((st, k) => (
        <Sequence key={k} from={f(st)} durationInFrames={f(Math.min(BED, TL.end - st))}>
          <Audio src={staticFile("music_bed.mp3")} volume={(fr) => {
            const local = fr / FPS;
            const fade = interpolate(local, [0, XF, BED - XF, BED], [k ? 0 : 1, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const end = interpolate(st + local, [TL.end - 4, TL.end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return MUSIC_VOL * fade * end * offGain(st + local);
          }} />
        </Sequence>
      ))}
    </>
  );
};

const Film: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    {(TL.shots as Shot[]).map((s, i) => (
      <Sequence key={i} from={f(s.a)} durationInFrames={f(s.b) - f(s.a)}>
        {s.kind === "map" ? <MapShot s={s} /> : s.kind === "card" ? <Card s={s} /> : s.kind === "vs" ? <Vs s={s} /> : s.kind === "timeline" ? <Timeline s={s} /> : <Still s={s} i={i} />}
      </Sequence>
    ))}
    <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 62%, rgba(8,6,2,.30) 100%)" }} />
    {TL.text.map((x, i) => (
      <Sequence key={`t${i}`} from={f(x.a)} durationInFrames={f(x.b) - f(x.a)}><Overlay t={x.t} s={x.s} dur={f(x.b) - f(x.a)} /></Sequence>
    ))}
    <Captions />
    <Audio src={staticFile("vo.wav")} />
    <Music />
  </AbsoluteFill>
);

registerRoot(() => <Composition id="Lustig" component={Film} durationInFrames={DUR} fps={FPS} width={1920} height={1080} />);
