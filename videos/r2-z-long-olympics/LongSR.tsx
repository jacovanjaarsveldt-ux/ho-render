import React from "react";
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame, interpolate, spring, Easing, continueRender, delayRender, registerRoot, Composition } from "remotion";
import TL from "./timeline.json";

// SportsRoom long video, 16:9 1920x1080. Built by tools/build_tl.py from the voice line timings and the per-line shot list.
// Shot kinds: img (full-frame still, one slow eased move), comp (whole picture on a blurred copy of itself, for portraits and small files),
// card (text card, the words come from the script), count (countdown card: big number + chapter title).
// Captions: Anton, uppercase, bottom, SportsRoom red #DD1118 on the spoken word. Audio is mixed separately and muxed in render-long-sync.yml.
const FPS = 30;
const f = (s: number) => Math.round(s * FPS);
const C = { red: "#DD1118", ink: "#0E0C0A", cream: "#F3EEE4" };
const h = delayRender("fonts");
Promise.all([["Anton", "Anton.woff2", "400"], ["Archivo", "Archivo-900.woff2", "900"]].map(([n, file, w]) => new FontFace(n, `url(${staticFile(file)}) format("woff2")`, { weight: w }).load().then((ff) => (document.fonts as any).add(ff)))).then(() => continueRender(h));
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const DISPLAY: React.CSSProperties = { fontFamily: "Anton, Impact, sans-serif", textTransform: "uppercase", letterSpacing: "0.01em" };
type Shot = { a: number; b: number; kind: string; src?: string; cam?: string; o?: string; dir?: number; text?: string; num?: string; title?: string; bg?: string };

const move = (cam: string | undefined, t: number, dir = 1, amp = 1) => {
  let scale = 1, tx = 0;
  if (cam === "push") scale = 1 + 0.05 * amp * t; else if (cam === "pull") scale = 1 + 0.05 * amp * (1 - t); else if (cam === "pan") { scale = 1.07; tx = dir * (t - 0.5) * 80 * amp; }
  return { scale, tx };
};
const useT = (s: Shot) => { const fr = useCurrentFrame(); return interpolate(fr, [0, f(s.b - s.a)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) }); };

const Still: React.FC<{ s: Shot }> = ({ s }) => {
  const t = useT(s); const { scale, tx } = move(s.cam, t, s.dir);
  return <AbsoluteFill style={{ overflow: "hidden", background: C.ink }}>
    <Img src={staticFile(s.src!)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: s.o ?? "50% 50%", transformOrigin: s.o ?? "50% 50%", transform: `translateX(${tx}px) scale(${scale})` }} />
  </AbsoluteFill>;
};
const Comp: React.FC<{ s: Shot }> = ({ s }) => {
  const t = useT(s); const { scale, tx } = move(s.cam === "pan" ? "push" : s.cam, t, s.dir, 0.8);
  return <AbsoluteFill style={{ overflow: "hidden", background: C.ink }}>
    <Img src={staticFile(s.src!)} style={{ position: "absolute", inset: -60, width: "calc(100% + 120px)", height: "calc(100% + 120px)", objectFit: "cover", filter: "blur(38px) brightness(0.42) saturate(0.8)" }} />
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <Img src={staticFile(s.src!)} style={{ width: "92%", height: "100%", objectFit: "contain", transformOrigin: s.o ?? "50% 50%", transform: `translateX(${tx}px) scale(${scale})`, filter: "drop-shadow(0 18px 40px rgba(0,0,0,.65))" }} />
    </AbsoluteFill>
  </AbsoluteFill>;
};
const Paper: React.FC<{ s: Shot }> = ({ s }) => s.bg
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
      <div style={{ ...DISPLAY, fontSize: 84, color: C.cream, marginTop: 10, opacity: interpolate(fr, [6, 14], [0, 1], clamp), letterSpacing: "0.03em" }}>{s.title}</div>
    </AbsoluteFill></AbsoluteFill>;
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
      {s.kind === "comp" ? <Comp s={s} /> : s.kind === "card" ? <Card s={s} /> : s.kind === "count" ? <Count s={s} /> : <Still s={s} />}
    </Sequence>)}
    <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 60%, rgba(6,4,2,.35) 100%)" }} />
    <AbsoluteFill style={{ pointerEvents: "none", background: "linear-gradient(rgba(0,0,0,0) 72%, rgba(0,0,0,.45) 100%)" }} />
    {(tl.subs as number[]).map((a, i) => <Sequence key={`p${i}`} from={f(a)} durationInFrames={120}><Subscribe /></Sequence>)}
    <Captions />
  </AbsoluteFill>;
};
registerRoot(() => <Composition id="Long" component={Film} durationInFrames={f((TL as any).end)} fps={FPS} width={1920} height={1080} />);
