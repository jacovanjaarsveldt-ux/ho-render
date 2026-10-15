import React from "react";
import {
  AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate,
  spring, staticFile, useCurrentFrame, useVideoConfig, Easing,
} from "remotion";

// Subscribe moments in the channel's own look (navy, gold, cream, the H crest).
// ShortEndCard: 3 s card appended to every Short.  SubscribePopup: 5 s overlay for longs, top-right, after 3:00.

const P = { navy: "#0D1530", navyHi: "#1B2754", gold: "#D6AE62", goldHi: "#F0D59A", goldLo: "#A7823F", cream: "#F4EBD8", red: "#E10600", done: "#2B2F3A" };
const fontsLoaded = delayRender("fonts");
Promise.all([
  ["Cinzel", "Cinzel-900.woff2", "900"], ["Cinzel", "Cinzel-700.woff2", "700"], ["Archivo", "Archivo-900.woff2", "900"],
].map(([n, f, w]) => new FontFace(n, `url(${staticFile(f)}) format("woff2")`, { weight: w }).load().then((ff) => (document.fonts as any).add(ff))))
  .then(() => continueRender(fontsLoaded));

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.22, 1, 0.36, 1);

// The crest, drawn on: ring traces, pillars rise, gold bar sweeps across.
const Crest: React.FC<{ size: number; t: number }> = ({ size, t }) => {
  const ring = interpolate(t, [0, 16], [0, 1], { ...clamp, easing: ease });
  const pill = interpolate(t, [6, 18], [0, 1], { ...clamp, easing: ease });
  const bar = interpolate(t, [12, 24], [0, 1], { ...clamp, easing: ease });
  const C = 2 * Math.PI * 318;
  return (
    <svg width={size} height={size} viewBox="0 0 1080 1080">
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={P.goldHi} /><stop offset="0.5" stopColor={P.gold} /><stop offset="1" stopColor={P.goldLo} /></linearGradient>
        <radialGradient id="cb" cx="50%" cy="42%" r="70%"><stop offset="0" stopColor="#1A2550" /><stop offset="1" stopColor={P.navy} /></radialGradient>
      </defs>
      <circle cx="540" cy="540" r="372" fill="url(#cb)" />
      <circle cx="540" cy="540" r="318" fill="none" stroke="url(#cg)" strokeWidth="18" strokeDasharray={C} strokeDashoffset={C * (1 - ring)} transform="rotate(-90 540 540)" />
      <g fill={P.cream} style={{ transformOrigin: "540px 540px", transform: `scaleY(${pill})` }}>
        <rect x="378" y="330" width="74" height="420" /><rect x="628" y="330" width="74" height="420" />
        <rect x="346" y="318" width="138" height="20" /><rect x="596" y="318" width="138" height="20" />
        <rect x="346" y="742" width="138" height="20" /><rect x="596" y="742" width="138" height="20" />
      </g>
      <rect x="186" y="522" width="708" height="36" fill="url(#cg)" style={{ transformOrigin: "540px 540px", transform: `scaleX(${bar})` }} />
    </svg>
  );
};

const Bell: React.FC<{ size: number; swing: number }> = ({ size, swing }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: `rotate(${swing}deg)`, transformOrigin: "50% 8%" }}>
    <path d="M12 2.5c-.8 0-1.4.6-1.4 1.4v.6C7.9 5.2 6 7.6 6 10.5v4.2l-1.6 2.1c-.3.4 0 1 .5 1h14.2c.5 0 .8-.6.5-1L18 14.7v-4.2c0-2.9-1.9-5.3-4.6-6v-.6c0-.8-.6-1.4-1.4-1.4zM9.7 19.2a2.3 2.3 0 0 0 4.6 0z" fill={P.cream} />
  </svg>
);

const Cursor: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 20 28">
    <path d="M2 1.5 L2 21.5 L7 17 L10.4 25.5 L14 24 L10.6 15.8 L17.5 15.6 Z" fill="#fff" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

// Red pill -> pressed -> grey "SUBSCRIBED" with a ringing bell and a small gold burst.
const SubButton: React.FC<{ t: number; click: number; s: number }> = ({ t, click, s }) => {
  const { fps } = useVideoConfig();
  const pop = spring({ frame: t, fps, config: { damping: 11, stiffness: 160 } });
  const press = interpolate(t, [click - 2, click, click + 4], [1, 0.9, 1], clamp);
  const done = t >= click;
  const swing = done ? Math.sin((t - click) * 0.9) * 22 * Math.exp(-(t - click) / 14) : 0;
  const burst = interpolate(t, [click, click + 14], [0, 1], clamp);
  return (
    <div style={{ position: "relative", transform: `scale(${pop * press})` }}>
      {done && Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return <div key={i} style={{ position: "absolute", left: "50%", top: "50%", width: 10 * s, height: 10 * s, borderRadius: 10 * s, background: i % 2 ? P.goldHi : P.gold,
          transform: `translate(${Math.cos(a) * 190 * s * burst - 5 * s}px, ${Math.sin(a) * 70 * s * burst - 5 * s}px) scale(${1 - burst})`, opacity: 1 - burst }} />;
      })}
      <div style={{ display: "flex", alignItems: "center", gap: 14 * s, padding: `${18 * s}px ${40 * s}px`, borderRadius: 999,
        background: done ? P.done : P.red, border: `${3 * s}px solid ${done ? P.gold : "rgba(255,255,255,0.15)"}`,
        boxShadow: `0 ${10 * s}px ${30 * s}px rgba(0,0,0,0.45)` }}>
        {done && <Bell size={34 * s} swing={swing} />}
        <span style={{ fontFamily: "Archivo", fontWeight: 900, fontSize: 40 * s, letterSpacing: "0.06em", color: done ? P.cream : "#fff" }}>{done ? "SUBSCRIBED" : "SUBSCRIBE"}</span>
      </div>
    </div>
  );
};

const Dust: React.FC<{ w: number; h: number }> = ({ w, h }) => {
  const fr = useCurrentFrame();
  return <>{Array.from({ length: 26 }).map((_, i) => {
    const x = (i * 197) % w, y0 = (i * 331) % h, r = 2 + (i % 4) * 1.5;
    return <div key={i} style={{ position: "absolute", left: x + Math.sin((fr + i * 30) / 30) * 10, top: (y0 - fr * (0.6 + (i % 3) * 0.4) + h * 4) % h,
      width: r, height: r, borderRadius: r, background: "rgba(240,213,154,0.45)" }} />;
  })}</>;
};

// 3 s (90 frames at 30 fps) end card for 1080x1920 Shorts. Content sits between y 300 and 1400 and left of the right-hand button rail.
export const ShortEndCard: React.FC = () => {
  const fr = useCurrentFrame();
  const CLICK = 46;
  const inOp = interpolate(fr, [0, 6], [0, 1], clamp);
  const name = interpolate(fr, [16, 30], [0, 1], { ...clamp, easing: ease });
  const curX = interpolate(fr, [26, CLICK - 2], [380, 40], { ...clamp, easing: ease });
  const curY = interpolate(fr, [26, CLICK - 2], [320, 40], { ...clamp, easing: ease });
  const curOp = interpolate(fr, [26, 30, 70, 80], [0, 1, 1, 0], clamp);
  const outOp = interpolate(fr, [82, 90], [1, 0.85], clamp);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 46% 42%, ${P.navyHi} 0%, ${P.navy} 58%, #070B1C 100%)`, opacity: inOp * outOp }}>
      <AbsoluteFill style={{ opacity: 0.05, backgroundImage: "repeating-linear-gradient(135deg, #fff 0 1px, transparent 1px 14px)" }} />
      <Dust w={1080} h={1920} />
      <div style={{ position: "absolute", left: 0, width: 1080, top: 330, height: 1070, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Crest size={460} t={fr} />
        <div style={{ marginTop: 18, fontFamily: "Cinzel", fontWeight: 900, fontSize: 54, letterSpacing: "0.06em", whiteSpace: "nowrap", textAlign: "center", color: P.cream, opacity: name, transform: `translateY(${(1 - name) * 30}px)` }}>HISTORY OUTSCALED</div>
        <div style={{ width: 480 * name, height: 4, marginTop: 18, background: `linear-gradient(90deg, transparent, ${P.gold}, transparent)` }} />
        <div style={{ position: "relative", marginTop: 80 }}>
          <Sequence from={22} layout="none"><SubButton t={fr - 22} click={CLICK - 22} s={1.5} /></Sequence>
          <div style={{ position: "absolute", left: "55%", top: "55%", opacity: curOp, transform: `translate(${curX}px, ${curY}px) scale(${fr >= CLICK - 2 && fr <= CLICK + 3 ? 0.88 : 1})` }}><Cursor size={76} /></div>
        </div>
      </div>
      <Audio src={staticFile("whoosh.mp3")} volume={0.35} />
      <Sequence from={22}><Audio src={staticFile("sfx_pop.wav")} volume={0.5} /></Sequence>
      <Sequence from={CLICK}><Audio src={staticFile("sfx_click.wav")} volume={0.7} /></Sequence>
      <Sequence from={CLICK + 1}><Audio src={staticFile("sfx_bell.wav")} volume={0.35} /></Sequence>
    </AbsoluteFill>
  );
};

// 5 s (150 frames) overlay for 1920x1080 longs. Transparent; slides in at the top-right, clicks, slides out.
export const SubscribePopup: React.FC<{ sfx?: boolean }> = ({ sfx = true }) => {
  const fr = useCurrentFrame();
  const { fps } = useVideoConfig();
  const CLICK = 62;
  const slide = spring({ frame: fr, fps, config: { damping: 15, stiffness: 120 } });
  const leave = interpolate(fr, [128, 146], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const x = (1 - slide) * 760 + leave * 760;
  const curX = interpolate(fr, [34, CLICK - 2], [260, 30], { ...clamp, easing: ease });
  const curY = interpolate(fr, [34, CLICK - 2], [180, 22], { ...clamp, easing: ease });
  const curOp = interpolate(fr, [34, 38, 86, 96], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", right: 56, top: 54, transform: `translateX(${x}px)`, display: "flex", alignItems: "center", gap: 22,
        padding: "16px 22px 16px 16px", borderRadius: 999, background: "rgba(13,21,48,0.88)", border: `3px solid ${P.gold}`, boxShadow: "0 14px 40px rgba(0,0,0,0.5)" }}>
        <Crest size={104} t={fr - 4} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontFamily: "Cinzel", fontWeight: 900, fontSize: 30, letterSpacing: "0.07em", color: P.cream, lineHeight: 1.05 }}>HISTORY OUTSCALED</div>
        </div>
        <div style={{ position: "relative" }}>
          <Sequence from={14} layout="none"><SubButton t={fr - 14} click={CLICK - 14} s={0.8} /></Sequence>
          <div style={{ position: "absolute", left: "50%", top: "50%", opacity: curOp, transform: `translate(${curX}px, ${curY}px) scale(${fr >= CLICK - 2 && fr <= CLICK + 3 ? 0.88 : 1})` }}><Cursor size={40} /></div>
        </div>
      </div>
      {sfx && <>
        <Sequence from={0}><Audio src={staticFile("whoosh.mp3")} volume={0.25} /></Sequence>
        <Sequence from={CLICK}><Audio src={staticFile("sfx_click.wav")} volume={0.55} /></Sequence>
        <Sequence from={CLICK + 1}><Audio src={staticFile("sfx_bell.wav")} volume={0.25} /></Sequence>
      </>}
    </AbsoluteFill>
  );
};

