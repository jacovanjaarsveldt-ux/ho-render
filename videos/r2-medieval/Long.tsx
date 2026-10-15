import React from "react";
import {
  AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, interpolate,
  Easing, continueRender, delayRender, registerRoot, Composition,
} from "remotion";
import TL from "./timeline.json";
import words from "./words_cap.json";
import { SubscribePopup } from "./EndCard";
import { QCard, Cutaway, Heat, Calendar, NightBar, Gap } from "./Scenes";

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
      <Img src={staticFile(s.src!)} style={{ width: "100%", height: "100%", objectFit: "cover", transformOrigin: s.o ?? "50% 50%", transform: `translateX(${tx}px) scale(${scale * ((s as any).crop ?? 1)})` }} />
    </AbsoluteFill>
  );
};
const Clip: React.FC<{ s: Shot }> = ({ s }) => (
  <AbsoluteFill style={{ background: C.ink }}>
    <OffthreadVideo src={staticFile(s.src!)} muted playbackRate={s.rate ?? 1} startFrom={f((s.use ?? [0])[0])} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "contrast(1.04) saturate(1.05)" }} />
  </AbsoluteFill>
);

// ---------- overlays + captions ----------
const Chapter: React.FC<{ t: string; dur: number }> = ({ t, dur }) => {
  const fr = useCurrentFrame();
  const op = interpolate(fr, [0, 8, dur - 8, dur], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "flex-start", paddingTop: 70, paddingLeft: 90, opacity: op, background: "linear-gradient(rgba(0,0,0,.5), rgba(0,0,0,0) 30%)" }}>
      <div style={{ fontFamily: "Cinzel", fontWeight: 900, fontSize: 60, textAlign: "left", color: C.cream, letterSpacing: "0.1em", textShadow: "0 6px 30px rgba(0,0,0,.8)" }}>{t}</div>
      <div style={{ width: 340, height: 3, marginTop: 8, background: `linear-gradient(90deg, ${C.gold}, transparent)` }} />
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
