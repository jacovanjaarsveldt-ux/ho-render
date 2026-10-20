import React from "react";
import {
  AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, interpolate, spring,
  Easing, continueRender, delayRender, registerRoot, Composition,
} from "remotion";
import TL from "./timeline.json";
import { ShortPopup } from "./EndCard";

// History Outscaled Short, round 2 (pilot). One timeline.json per Short (build.py).
// Rules baked in: first cut by 2.5 s, top text only 2-3 moments at y >= 300, word-synced Anton captions in the safe zone,
// no whooshes on cuts (a few real sound effects only), no music unless the timeline has it, ends on the bridge line (loop), small Subscribe pop-up mid-video, hook label from frame 1.
const FPS = 30;
const f = (s: number) => Math.round(s * FPS);
const C = { gold: "#FFC83D", ink: "#15110C" };
const h = delayRender("font");
new FontFace("Anton", `url(${staticFile("Anton.woff2")}) format("woff2")`).load().then((ff) => { (document.fonts as any).add(ff); continueRender(h); });
const DISPLAY: React.CSSProperties = { fontFamily: "Anton, Impact, sans-serif", textTransform: "uppercase", letterSpacing: "0.01em" };

type Shot = { a: number; b: number; kind: string; src: string; z?: number[]; o?: string; rate?: number };
type Wd = { w: string; s: number; e: number };
const words = (TL as any).words as Wd[];
const END = (TL as any).end as number; // the video ends 0.2 s after the bridge line so it loops; no end card

const Still: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame();
  const t = interpolate(fr, [0, f(s.b - s.a)], [0, 1], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.sin) });
  // v2: no punch-in on cuts. "static", "push" (1.00 to 1.04 over the whole shot) or "pan" (fixed 1.06, slow horizontal drift).
  const mv = (s as any).mv ?? "static";
  const scl = mv === "push" ? 1 + 0.04 * t : mv === "pan" ? 1.06 : 1;
  const tx = mv === "pan" ? ((s as any).dir ?? 1) * (t - 0.5) * 44 : 0;
  return <AbsoluteFill style={{ overflow: "hidden", background: C.ink }}>
    <Img src={staticFile(s.src)} style={{ width: "100%", height: "100%", objectFit: "cover", transformOrigin: s.o ?? "50% 50%", transform: `translateX(${tx}px) scale(${scl})` }} />
  </AbsoluteFill>;
};
const Clip: React.FC<{ s: Shot }> = ({ s }) => <AbsoluteFill style={{ background: C.ink }}>
  <OffthreadVideo src={staticFile(s.src)} muted playbackRate={s.rate ?? 1} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "contrast(1.05) saturate(1.06)" }} />
</AbsoluteFill>;
const Big: React.FC<{ t: string; c: string; dur: number; instant?: boolean }> = ({ t, c, dur, instant }) => {
  const fr = useCurrentFrame() + (instant ? 30 : 0);
  const sp = spring({ frame: fr, fps: FPS, config: { damping: 11, stiffness: 240 } });
  const out = interpolate(fr - (instant ? 30 : 0), [dur - 6, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ alignItems: "center", paddingTop: 330 }}>
    <div style={{ ...DISPLAY, fontSize: 118, lineHeight: 0.95, textAlign: "center", maxWidth: 900, color: c === "gold" ? C.gold : "#fff", opacity: Math.min(1, fr / 3) * out, transform: `scale(${interpolate(sp, [0, 1], [1.8, 1])}) rotate(${interpolate(sp, [0, 1], [-6, -2])}deg)`, WebkitTextStroke: "7px #15110C", paintOrder: "stroke fill", textShadow: "0 7px 0 rgba(0,0,0,.6), 0 0 30px rgba(0,0,0,.5)" }}>{t}</div>
  </AbsoluteFill>;
};
const Label: React.FC<{ t: string; dx: number; dy: number; fs?: number }> = ({ t, dx, dy, fs = 70 }) => {
  // Hook pass: white rounded label from frame 1 (no fade-in), top y = 330, full until 2.5 s, gone by 3.0 s. dx/dy are the measured optical-centre corrections (scripts/check-label-centre.py).
  // fs = font size (reduced when the text is long, so the box stays inside the safe zone x 110-970); a "\n" in t makes two lines.
  const fr = useCurrentFrame();
  const op = interpolate(fr, [75, 90], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lines = t.split("\n");
  return <AbsoluteFill style={{ alignItems: "center", paddingTop: 330, opacity: op }}>
    <div style={{ minHeight: 112, padding: lines.length > 1 ? "22px 46px" : "0 46px", borderRadius: 20, background: "#FBF9F3", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 18px rgba(0,0,0,.35)" }}>
      <span style={{ fontFamily: "Archivo, Arial Black, sans-serif", fontWeight: 900, fontSize: fs, lineHeight: lines.length > 1 ? 1.14 : 1, color: "#15110C", whiteSpace: "pre", textAlign: "center", transform: `translate(${dx}px, ${dy}px)` }}>{t}</span>
    </div>
  </AbsoluteFill>;
};
const Captions: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  if (t >= END) return null;
  const groups: Wd[][] = [];
  let cur: Wd[] = [];
  for (const w of words) { cur.push(w); if (cur.length >= 3 || /[.,!?…:]$/.test(w.w)) { groups.push(cur); cur = []; } }
  if (cur.length) groups.push(cur);
  const g = groups.find((gr, i) => t >= gr[0].s - 0.05 && t < Math.min(groups[i + 1]?.[0].s ?? 1e9, gr[gr.length - 1].e + 0.6));
  if (!g) return null;
  return <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 430 }}>
    <div style={{ ...DISPLAY, fontSize: 58, textAlign: "center", maxWidth: 780, lineHeight: 1.1 }}>
      {g.map((w, i) => <span key={i} style={{ color: t >= w.s - 0.03 && t < w.e + 0.05 ? C.gold : "#fff", textShadow: "0 4px 0 #000, 0 0 16px rgba(0,0,0,.85)", marginRight: 16 }}>{w.w}</span>)}
    </div>
  </AbsoluteFill>;
};

const Reel: React.FC = () => {
  const D = f(END);
  const tl = TL as any;
  return <AbsoluteFill style={{ background: C.ink }}>
    <Sequence from={0} durationInFrames={D}>
      {(tl.shots as Shot[]).map((s, i) => <Sequence key={i} from={f(s.a)} durationInFrames={f(s.b) - f(s.a)}>{s.kind === "clip" ? <Clip s={s} /> : <Still s={s} />}</Sequence>)}
      <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 60%, rgba(8,6,2,.30) 100%)" }} />
      {(tl.text as any[]).map((x, i) => <Sequence key={`t${i}`} from={f(x.a)} durationInFrames={f(x.b) - f(x.a)}><Big t={x.t} c={x.c} dur={f(x.b) - f(x.a)} instant={x.a === 0} /></Sequence>)}
      <Captions />
      {tl.label && <Sequence from={0} durationInFrames={90}><Label t={tl.label.t} dx={tl.label.dx} dy={tl.label.dy} fs={tl.label.fs} /></Sequence>}
      {tl.popup && <Sequence from={f(tl.popup.a)} durationInFrames={75}><ShortPopup /></Sequence>}
    </Sequence>
  </AbsoluteFill>;
};

registerRoot(() => <Composition id="Short" component={Reel} durationInFrames={f((TL as any).end)} fps={FPS} width={1080} height={1920} />);
