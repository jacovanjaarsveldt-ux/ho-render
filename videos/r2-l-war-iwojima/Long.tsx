import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, interpolate, Easing, continueRender, delayRender, registerRoot, Composition, random } from "remotion";
import TL from "./timeline.json";
import { SubscribePopup } from "./EndCard";

// History Outscaled long (16:9, 1920x1080, 30 fps) from REAL archive material only (26 Nov 2026).
// Everything is placed by cuts.py (shots.json + words.json -> timeline.json). Audio is muxed by the render workflow (mode final) or by concat_parts.sh.
//  img     : still pre-composed by cuts.py to 16:9 (blur-fill when not 16:9), ONE slow eased move: push | pull | pan | hold
//  clip    : film pre-cut by cuts.py to exactly the slot, 1920x1080 (blur-fill when not 16:9), played as is, never stretched
//  card    : plain full-screen text card (number, quote, document line); captions hide under it
//  chapters: title card over the picture (number + title, fades in and out)
//  caps    : documentary captions, white, bottom, max 2 lines, no word highlight
// Compositions: Long (whole film), LongP1..LongPn (equal slices, for parallel GitHub renders; concat_parts.sh joins them).
const FPS = 30;
const f = (s: number) => Math.round(s * FPS);
const T = TL as any;
const DUR = f(T.end);
const C = { gold: "#D6AE62", cream: "#F4EBD8", ink: "#0B0A08", paper: "#14120E" };
const h = delayRender("fonts");
Promise.all([["Cinzel", "Cinzel-900.woff2", "900"], ["Cinzel", "Cinzel-700.woff2", "700"], ["Archivo", "Archivo-800.woff2", "800"], ["Archivo", "Archivo-900.woff2", "900"]]
  .map(([n, file, w]) => new FontFace(n, `url(${staticFile(file)}) format("woff2")`, { weight: w }).load().then((ff) => (document.fonts as any).add(ff))))
  .then(() => continueRender(h));
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
type Shot = { a: number; b: number; kind: string; src?: string; mv?: string; o?: string; dir?: number; card?: { t: string; sub?: string; style?: string } };

const Still: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame(); const dur = f(s.b - s.a);
  const t = interpolate(fr, [0, dur], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) });
  const mv = s.mv ?? "push"; let scale = 1, tx = 0;
  // slow: about 5% over the whole shot, never a punch-in
  if (mv === "push") scale = 1 + 0.05 * t; else if (mv === "pull") scale = 1.05 - 0.05 * t; else if (mv === "pan") { scale = 1.07; tx = (s.dir ?? 1) * (t - 0.5) * 90; }
  return <AbsoluteFill style={{ overflow: "hidden", background: C.ink }}>
    <Img src={staticFile(s.src!)} style={{ width: "100%", height: "100%", objectFit: "cover", transformOrigin: s.o ?? "50% 50%", transform: `translateX(${tx}px) scale(${scale})` }} />
  </AbsoluteFill>;
};
const Clip: React.FC<{ s: Shot }> = ({ s }) => <AbsoluteFill style={{ background: C.ink }}>
  <OffthreadVideo src={staticFile(s.src!)} muted style={{ width: "100%", height: "100%", objectFit: "contain" }} />
</AbsoluteFill>;

// Full-screen text card. style: number (one big figure + line), quote (italic serif + attribution), doc (typewriter-like document line)
const Card: React.FC<{ s: Shot }> = ({ s }) => {
  const fr = useCurrentFrame(); const dur = f(s.b - s.a); const c = s.card!;
  const op = interpolate(fr, [0, 10, dur - 8, dur], [0, 1, 1, 0.85], clamp);
  const rise = interpolate(fr, [0, 18], [14, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  const st = c.style ?? "quote";
  const main: React.CSSProperties = st === "number"
    ? { fontFamily: "Cinzel", fontWeight: 900, fontSize: 190, color: C.gold, letterSpacing: "0.02em", lineHeight: 1 }
    : st === "doc"
      ? { fontFamily: "'Courier New', Courier, monospace", fontWeight: 700, fontSize: 54, color: C.cream, lineHeight: 1.35, maxWidth: 1400, textAlign: "left", background: "rgba(244,235,216,.05)", padding: "40px 56px", borderLeft: `6px solid ${C.gold}` }
      : { fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 68, color: C.cream, lineHeight: 1.3, maxWidth: 1450, textAlign: "center" };
  return <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, #1E1B15 0%, ${C.paper} 60%, #070605 100%)`, alignItems: "center", justifyContent: "center" }}>
    <div style={{ opacity: op, transform: `translateY(${rise}px)`, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={main}>{st === "quote" ? `“${c.t}”` : c.t}</div>
      {c.sub ? <div style={{ marginTop: st === "number" ? 34 : 40, fontFamily: "Archivo", fontWeight: 800, fontSize: st === "number" ? 50 : 34, color: st === "number" ? C.cream : "rgba(244,235,216,.75)", letterSpacing: st === "number" ? "0.01em" : "0.12em", textTransform: st === "number" ? "none" : "uppercase", maxWidth: 1400, textAlign: "center" }}>{c.sub}</div> : null}
    </div>
  </AbsoluteFill>;
};

const Chapter: React.FC<{ n?: string; t: string; dur: number }> = ({ n, t, dur }) => {
  const fr = useCurrentFrame(); const op = interpolate(fr, [0, 12, dur - 12, dur], [0, 1, 1, 0], clamp);
  const bar = interpolate(fr, [6, 30], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: op, background: "rgba(5,4,3,.55)" }}>
    {n ? <div style={{ fontFamily: "Archivo", fontWeight: 800, fontSize: 30, letterSpacing: "0.4em", color: C.gold, marginBottom: 18 }}>{n.toUpperCase()}</div> : null}
    <div style={{ fontFamily: "Cinzel", fontWeight: 900, fontSize: 96, color: C.cream, letterSpacing: "0.06em", textAlign: "center", maxWidth: 1600, textShadow: "0 6px 30px rgba(0,0,0,.85)" }}>{t}</div>
    <div style={{ width: 520 * bar, height: 3, marginTop: 22, background: `linear-gradient(90deg, transparent, ${C.gold}, transparent)` }} />
  </AbsoluteFill>;
};

type Cap = { a: number; b: number; t: string };
const cardAt = (t: number) => (T.shots as Shot[]).some((s) => s.kind === "card" && t >= s.a && t < s.b);
const chapAt = (t: number) => ((T.chapters ?? []) as any[]).some((c) => t >= c.a && t < c.b);
const Captions: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  if (cardAt(t) || chapAt(t)) return null;
  const c = ((T.caps ?? []) as Cap[]).find((x) => t >= x.a && t < x.b);
  if (!c) return null;
  return <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 64 }}>
    <div style={{ fontFamily: "Archivo", fontWeight: 800, fontSize: 42, lineHeight: 1.25, maxWidth: 1320, textAlign: "center", color: "#fff", whiteSpace: "pre-line",
      textShadow: "0 2px 2px rgba(0,0,0,.9), 0 0 14px rgba(0,0,0,.85), 0 0 3px #000" }}>{c.t}</div>
  </AbsoluteFill>;
};

// Light film grain: one pre-made noise tile (public/grain.png, cuts.py) shifted every frame. Cheap; off when timeline.grain is false.
const Grain: React.FC = () => {
  const fr = useCurrentFrame();
  const x = Math.floor(random(`gx${fr}`) * 256), y = Math.floor(random(`gy${fr}`) * 256);
  return <AbsoluteFill style={{ pointerEvents: "none", backgroundImage: `url(${staticFile("grain.png")})`, backgroundPosition: `${x}px ${y}px`, opacity: T.grainOpacity ?? 0.07, mixBlendMode: "overlay" }} />;
};

const Film: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    {(T.shots as Shot[]).map((s, i) => (
      <Sequence key={i} from={f(s.a)} durationInFrames={Math.max(1, f(s.b) - f(s.a))}>
        {s.kind === "clip" ? <Clip s={s} /> : s.kind === "card" ? <Card s={s} /> : <Still s={s} />}
      </Sequence>
    ))}
    <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 60%, rgba(6,5,3,.35) 100%)" }} />
    {T.grain !== false ? <Grain /> : null}
    {((T.chapters ?? []) as any[]).map((x, i) => <Sequence key={`c${i}`} from={f(x.a)} durationInFrames={f(x.b) - f(x.a)}><Chapter n={x.n} t={x.t} dur={f(x.b) - f(x.a)} /></Sequence>)}
    {((T.subs ?? []) as number[]).map((a, i) => <Sequence key={`p${i}`} from={f(a)} durationInFrames={150}><SubscribePopup sfx={false} /></Sequence>)}
    <Captions />
  </AbsoluteFill>
);

// Part k of n renders frames [k*L, min(DUR,(k+1)*L)) of the same film.
const NP = Math.max(1, T.parts ?? 3); const L = Math.ceil(DUR / NP);
const Part: React.FC<{ k: number }> = ({ k }) => <Sequence from={-k * L}><Film /></Sequence>;
registerRoot(() => <>
  <Composition id="Long" component={Film} durationInFrames={DUR} fps={FPS} width={1920} height={1080} />
  {Array.from({ length: NP }, (_, k) => <Composition key={k} id={`LongP${k + 1}`} component={Part} defaultProps={{ k }} durationInFrames={Math.min(L, DUR - k * L)} fps={FPS} width={1920} height={1080} />)}
</>);
