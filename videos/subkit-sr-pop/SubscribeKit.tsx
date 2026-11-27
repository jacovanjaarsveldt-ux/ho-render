import React from "react";
import { AbsoluteFill, Freeze, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";

// Subscribe kit (27 Nov 2026) for History Outscaled (ho) and SportsRoom (sr) longs, 1920x1080, 30 fps.
// Design spec: lib/subkit/README.md (Fable spec). Popup: 126 frames (4.2 s), corner card, cursor clicks SUBSCRIBE, then the bell rings.
// EndCard: 150 frames (5 s) appended after the film's last frame (frozen, blurred, brand overlay), voice line in the mix.
// withSubkit(Film, TL): wraps a long's Film component. Active only when timeline.json has "subkit" (written by lib/subkit/subkit.py plan);
// without it the Film renders exactly as before. Fonts are loaded by the host composition (HO: Cinzel + Archivo, SR: Anton).

export const POP_LEN = 126;
export const END_LEN = 150;
export type Ch = "ho" | "sr";
const FPS = 30;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ioCubic = Easing.inOut(Easing.cubic);
const inCubic = Easing.in(Easing.cubic);

const HO = { navy: "#0D1530", navy2: "#1B2547", gold: "#D6AE62", goldHi: "#F0D59A", goldLo: "#A7823F", cream: "#F4EBD8", blue: "#168AFF" };
const SR = { ink: "#0E0C0A", ink2: "#1C1916", cream: "#F3EEE4", red: "#F52225" };

// ---------- small parts ----------
export const Crest: React.FC<{ size: number; t?: number }> = ({ size, t = 99 }) => {
  const e = Easing.bezier(0.22, 1, 0.36, 1);
  const ring = interpolate(t, [0, 16], [0, 1], { ...clamp, easing: e });
  const pill = interpolate(t, [6, 18], [0, 1], { ...clamp, easing: e });
  const bar = interpolate(t, [12, 24], [0, 1], { ...clamp, easing: e });
  const C = 2 * Math.PI * 318;
  return (
    <svg width={size} height={size} viewBox="0 0 1080 1080" style={{ display: "block" }}>
      <defs>
        <linearGradient id="skcg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={HO.goldHi} /><stop offset="0.5" stopColor={HO.gold} /><stop offset="1" stopColor={HO.goldLo} /></linearGradient>
        <radialGradient id="skcb" cx="50%" cy="42%" r="70%"><stop offset="0" stopColor="#1A2550" /><stop offset="1" stopColor={HO.navy} /></radialGradient>
      </defs>
      <circle cx="540" cy="540" r="372" fill="url(#skcb)" />
      <circle cx="540" cy="540" r="318" fill="none" stroke="url(#skcg)" strokeWidth="18" strokeDasharray={C} strokeDashoffset={C * (1 - ring)} transform="rotate(-90 540 540)" />
      <g fill={HO.cream} style={{ transformOrigin: "540px 540px", transform: `scaleY(${pill})` }}>
        <rect x="378" y="330" width="74" height="420" /><rect x="628" y="330" width="74" height="420" />
        <rect x="346" y="318" width="138" height="20" /><rect x="596" y="318" width="138" height="20" />
        <rect x="346" y="742" width="138" height="20" /><rect x="596" y="742" width="138" height="20" />
      </g>
      <rect x="186" y="522" width="708" height="36" fill="url(#skcg)" style={{ transformOrigin: "540px 540px", transform: `scaleX(${bar})` }} />
    </svg>
  );
};

const SRMark: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ width: size, height: size, borderRadius: size, background: SR.red, display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: `0 ${size * 0.05}px ${size * 0.2}px rgba(0,0,0,.45)` }}>
    <span style={{ fontFamily: "Anton, Impact, sans-serif", fontSize: size * 0.54, color: SR.cream, lineHeight: 1, letterSpacing: "0.01em", transform: `translateY(${size * 0.01}px)` }}>SR</span>
  </div>
);

const Cursor: React.FC<{ h: number }> = ({ h }) => (
  <svg width={h * 0.72} height={h} viewBox="0 0 20 28" style={{ display: "block", filter: "drop-shadow(0 2px 4px rgba(0,0,0,.4))" }}>
    <path d="M2 1.5 L2 21.5 L7 17 L10.4 25.5 L14 24 L10.6 15.8 L17.5 15.6 Z" fill="#fff" stroke="#0E0C0A" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

// bell glyph (outline after Lucide "bell", ISC licence), solid when rung
const BellGlyph: React.FC<{ size: number; stroke: string; fill: string; angle: number }> = ({ size, stroke, fill, angle }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", transform: `rotate(${angle}deg)`, transformOrigin: "50% 8%" }}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" fill={fill} stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
  </svg>
);

const Tick: React.FC<{ size: number; color: string; k: number }> = ({ size, color, k }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
    <path d="M4 12.5l5 5L20 6.5" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={24} strokeDashoffset={24 * (1 - k)} />
  </svg>
);

// ---------- the button + bell pair, shared by pop-up and end card ----------
// C = click frame on the button, B = press frame on the bell. s = scale (1 = pop-up size).
type PairGeo = { bw: number; bh: number; gap: number; r: number; font: number };
const Pair: React.FC<{ ch: Ch; fr: number; C: number; B: number; g: PairGeo }> = ({ ch, fr, C, B, g }) => {
  const { fps } = useVideoConfig();
  const press = fr < C - 1 ? 1 : fr < C + 3 ? interpolate(fr, [C - 1, C + 1], [1, 0.94], clamp) : 0.94 + 0.06 * spring({ frame: fr - (C + 3), fps, config: { damping: 12, stiffness: 200 } });
  const k = interpolate(fr, [C + 3, C + 9], [0, 1], clamp);
  const tick = interpolate(fr, [C + 4, C + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const rip = interpolate(fr, [C, C + 14], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const bellPress = fr < B ? 1 : interpolate(fr, [B, B + 2, B + 6], [1, 0.9, 1], clamp);
  const rung = fr >= B;
  const ang = rung ? 18 * Math.sin((2 * Math.PI * (fr - B)) / 8) * Math.exp(-(fr - B) / 9) : 0;
  const arcs = interpolate(fr, [B + 2, B + 6, B + 12, B + 16], [0, 1, 1, 0], clamp);
  const dot = rung ? spring({ frame: fr - (B + 4), fps, config: { damping: 10, stiffness: 220 } }) : 0;
  const ho = ch === "ho";
  const font = ho ? { fontFamily: "Archivo", fontWeight: 900, letterSpacing: "0.06em" } : { fontFamily: "Anton, Impact, sans-serif", letterSpacing: "0.03em" };
  const base: React.CSSProperties = { position: "absolute", inset: 0, borderRadius: g.r, display: "flex", alignItems: "center", justifyContent: "center", gap: g.font * 0.45 };
  const bs = g.bh; // bell box size
  const bellBox: React.CSSProperties = ho
    ? { width: bs, height: bs, borderRadius: bs, background: HO.navy2, border: `${1.5 * g.bh / 48}px solid ${HO.gold}` }
    : { width: bs, height: bs, borderRadius: g.r, background: SR.ink2 };
  return (
    <div style={{ display: "flex", gap: g.gap, alignItems: "center" }}>
      <div style={{ position: "relative", width: g.bw, height: g.bh, transform: `scale(${press})` }}>
        <div style={{ ...base, background: ho ? HO.blue : SR.red, opacity: 1 - k }}>
          <span style={{ ...font, fontSize: g.font, color: "#fff", lineHeight: 1 }}>SUBSCRIBE</span>
        </div>
        <div style={{ ...base, opacity: k, background: ho ? HO.navy2 : SR.cream, border: ho ? `${1.5 * g.bh / 48}px solid ${HO.gold}` : "none", boxSizing: "border-box" }}>
          <Tick size={g.font * 0.85} color={ho ? HO.gold : SR.ink} k={tick} />
          <span style={{ ...font, fontSize: g.font, color: ho ? HO.cream : SR.ink, lineHeight: 1 }}>SUBSCRIBED</span>
        </div>
        <div style={{ position: "absolute", left: "50%", top: "50%", width: 120 * g.bh / 48 * rip, height: 120 * g.bh / 48 * rip, borderRadius: 999,
          transform: "translate(-50%,-50%)", background: "#fff", opacity: fr >= C ? 0.35 * (1 - rip) : 0, pointerEvents: "none" }} />
      </div>
      <div style={{ position: "relative", ...bellBox, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${bellPress})`, flex: "none", boxSizing: "border-box" }}>
        <BellGlyph size={bs * 0.5} stroke={ho ? HO.cream : SR.cream} fill={rung ? (ho ? HO.gold : SR.red) : "none"} angle={ang} />
        {[-1, 1].map((d) => (
          <svg key={d} width={bs * 0.3} height={bs * 0.5} viewBox="0 0 10 20" style={{ position: "absolute", top: bs * 0.22, [d < 0 ? "left" : "right"]: bs * 0.02, opacity: arcs, transform: d < 0 ? "scaleX(-1)" : undefined } as React.CSSProperties}>
            <path d="M3 3 Q8 10 3 17" fill="none" stroke={ho ? HO.gold : SR.red} strokeWidth={2} strokeLinecap="round" />
          </svg>
        ))}
        <div style={{ position: "absolute", top: bs * 0.12, right: bs * 0.12, width: 14 * bs / 48, height: 14 * bs / 48, borderRadius: 99,
          background: ho ? HO.blue : SR.cream, transform: `scale(${dot})`, boxShadow: "0 0 0 2px rgba(0,0,0,.35)" }} />
      </div>
    </div>
  );
};

// cursor path: from start -> button centre (arrive at C-2), -> bell centre (arrive at B-2), fade in at a0, out after B+16
const useCursor = (fr: number, a0: number, C: number, B: number, start: number[], btn: number[], bell: number[]) => {
  const t1 = interpolate(fr, [a0, C - 2], [0, 1], { ...clamp, easing: ioCubic });
  const t2 = interpolate(fr, [C + 12, B - 2], [0, 1], { ...clamp, easing: ioCubic });
  const x = start[0] + (btn[0] - start[0]) * t1 + (bell[0] - btn[0]) * t2;
  const y = start[1] + (btn[1] - start[1]) * t1 + (bell[1] - btn[1]) * t2;
  const op = interpolate(fr, [a0, a0 + 4, B + 16, B + 24], [0, 1, 1, 0], clamp);
  const sc = (fr >= C - 1 && fr <= C + 2) || (fr >= B && fr <= B + 2) ? 0.88 : 1;
  return { x, y, op, sc };
};

// ---------- pop-up ----------
export const Popup: React.FC<{ ch: Ch }> = ({ ch }) => {
  const fr = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ho = ch === "ho";
  const C = 42, B = 68;
  const W = ho ? 460 : 480, H = ho ? 164 : 150;
  const left = ho ? 56 : 1376, top = ho ? 56 : 110;
  const ex = interpolate(fr, [108, 126], [0, 1], { ...clamp, easing: inCubic });
  let op = 1, tx = 0, bar = 1, wipe = 1;
  if (ho) { const s = spring({ frame: fr, fps, config: { damping: 200, stiffness: 120, mass: 1 } }); op = s; tx = -24 * (1 - s); }
  else { bar = interpolate(fr, [0, 6], [0, 1], clamp); wipe = spring({ frame: fr - 4, fps, config: { damping: 18, stiffness: 160, mass: 0.8 } }); }
  op *= 1 - ex; tx += (ho ? -16 : 16) * ex;
  const btnX = ho ? 20 : 28, btnY = ho ? 98 : 88;
  const geo: PairGeo = ho ? { bw: 356, bh: 48, gap: 16, r: 24, font: 20 } : { bw: 356, bh: 46, gap: 16, r: 4, font: 26 };
  const cur = useCursor(fr, 18, C, B, [430, 230], [btnX + 178, btnY + geo.bh / 2], [btnX + 356 + 16 + geo.bh / 2, btnY + geo.bh / 2]);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left, top, width: W, height: H, opacity: op, transform: `translateX(${tx}px)` }}>
        {ho ? (
          <div style={{ position: "absolute", inset: 0, borderRadius: 18, background: "rgba(13,21,48,.92)", boxShadow: "0 12px 32px rgba(0,0,0,.45), inset 0 0 0 1.5px rgba(214,174,98,.55)" }} />
        ) : (
          <>
            <div style={{ position: "absolute", inset: 0, borderRadius: 4, background: "rgba(14,12,10,.94)", boxShadow: "0 10px 28px rgba(0,0,0,.5)", clipPath: `inset(0 ${100 - 100 * wipe}% 0 0)` }} />
            <div style={{ position: "absolute", left: 0, top: 0, width: 8, height: H, background: SR.red, transformOrigin: "50% 0%", transform: `scaleY(${bar})`, borderRadius: "4px 0 0 4px" }} />
          </>
        )}
        <div style={{ position: "absolute", inset: 0, clipPath: ho ? undefined : `inset(0 ${100 - 100 * wipe}% 0 0)` }}>
          {ho ? (
            <>
              <div style={{ position: "absolute", left: 20, top: 20 }}><Crest size={64} t={fr - 2} /></div>
              <div style={{ position: "absolute", left: 100, top: 26, fontFamily: "Cinzel", fontWeight: 700, fontSize: 20, letterSpacing: "0.08em", color: HO.gold, lineHeight: 1, whiteSpace: "nowrap" }}>HISTORY OUTSCALED</div>
              <div style={{ position: "absolute", left: 100, top: 56, fontFamily: "Archivo", fontWeight: 800, fontSize: 18, color: HO.cream, lineHeight: 1, whiteSpace: "nowrap" }}>Subscribe and turn on notifications</div>
            </>
          ) : (
            <>
              <div style={{ position: "absolute", left: 28, top: 18 }}><SRMark size={56} /></div>
              <div style={{ position: "absolute", left: 100, top: 18, fontFamily: "Anton, Impact, sans-serif", fontSize: 24, lineHeight: "28px", color: SR.cream, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
                SUBSCRIBE AND TURN ON<br /><span style={{ color: SR.red }}>NOTIFICATIONS</span>
              </div>
            </>
          )}
          <div style={{ position: "absolute", left: btnX, top: btnY }}><Pair ch={ch} fr={fr} C={C} B={B} g={geo} /></div>
        </div>
        <div style={{ position: "absolute", left: cur.x - 2, top: cur.y - 1, opacity: cur.op * op, transform: `scale(${cur.sc})`, transformOrigin: "2px 1px" }}><Cursor h={28} /></div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- end card ----------
// bg: the film's last frame (frozen). P: button press frame, B: bell frame (from the voice word timings, see subkit.py).
export const EndCard: React.FC<{ ch: Ch; bg: React.ReactNode; P?: number; B?: number }> = ({ ch, bg, P = 52, B = 88 }) => {
  const fr = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ho = ch === "ho";
  const tb = interpolate(fr, [0, 18], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const blur = 24 * tb;
  const scale = interpolate(fr, [0, 18, 149], [1, 1.06, 1.09], clamp);
  // element entrance: HO fade + 16 px rise (spring damping 200), SR left-to-right wipe (spring 18/160)
  const ent = (at: number): React.CSSProperties => {
    if (ho) { const s = spring({ frame: fr - at, fps, config: { damping: 200, stiffness: 120 } }); return { opacity: s, transform: `translateY(${16 * (1 - s)}px)` }; }
    const s = spring({ frame: fr - at, fps, config: { damping: 18, stiffness: 160 } }); return { clipPath: `inset(-20px ${Math.max(0, 100 - 100 * s)}% -20px -20px)`, opacity: Math.min(1, s * 3) };
  };
  const markIn = (() => { const s = spring({ frame: fr - 6, fps, config: { damping: 200, stiffness: 120 } }); return { opacity: s, transform: `scale(${0.9 + 0.1 * s})` }; })();
  const geo: PairGeo = ho ? { bw: 360, bh: 72, gap: 20, r: 36, font: 28 } : { bw: 380, bh: 80, gap: 20, r: 4, font: 40 };
  const bx = ho ? 274 : 160, by = ho ? 660 : 630;
  const cur = useCursor(fr, P - 26, P, B, [900, 900], [bx + geo.bw / 2, by + geo.bh / 2], [bx + geo.bw + geo.gap + geo.bh / 2, by + geo.bh / 2]);
  const txt = (x: number, base: number, size: number, extra: React.CSSProperties, children: React.ReactNode, at: number, center = false) => (
    <div style={{ position: "absolute", left: center ? x - 600 : x, width: center ? 1200 : undefined, top: base - size * 0.8, textAlign: center ? "center" : "left", fontSize: size, lineHeight: 1, whiteSpace: "nowrap", ...extra, ...ent(at) }}>{children}</div>
  );
  return (
    <AbsoluteFill style={{ background: ho ? HO.navy : SR.ink, overflow: "hidden" }}>
      <AbsoluteFill style={{ filter: `blur(${blur}px)`, transform: `scale(${scale})` }}>{bg}</AbsoluteFill>
      <AbsoluteFill style={{ background: ho ? HO.navy : SR.ink, opacity: (ho ? 0.78 : 0.82) * tb }} />
      {ho ? <AbsoluteFill style={{ opacity: tb, background: "radial-gradient(ellipse at 45% 45%, rgba(0,0,0,0) 45%, rgba(4,7,18,.7) 100%)" }} />
        : <div style={{ position: "absolute", left: 0, top: 0, width: 12, height: 1080 * interpolate(fr, [0, 12], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) }), background: SR.red }} />}
      {ho ? (
        <>
          <div style={{ position: "absolute", left: 390, top: 250, ...markIn }}><Crest size={220} t={fr - 6} /></div>
          {txt(500, 560, 44, { fontFamily: "Cinzel", fontWeight: 900, letterSpacing: "0.06em", color: HO.cream }, "HISTORY OUTSCALED", 14, true)}
          {txt(500, 610, 26, { fontFamily: "Archivo", fontWeight: 800, color: HO.gold }, "Thanks for watching", 18, true)}
          <div style={{ position: "absolute", left: bx, top: by, ...ent(24) }}><Pair ch="ho" fr={fr} C={P} B={B} g={geo} /></div>
          {txt(500, 790, 24, { fontFamily: "Archivo", fontWeight: 800, color: "rgba(244,235,216,.7)" }, "Subscribing helps support the channel", 36, true)}
          {txt(1080, 276, 26, { fontFamily: "Cinzel", fontWeight: 700, letterSpacing: "0.12em", color: HO.gold }, "WATCH NEXT", 30)}
          <div style={{ position: "absolute", left: 1080, top: 300, width: 720, height: 405, borderRadius: 12, boxSizing: "border-box", border: "1.5px solid rgba(214,174,98,.45)", background: "rgba(27,37,71,.35)", ...ent(32) }} />
        </>
      ) : (
        <>
          <div style={{ position: "absolute", left: 160, top: 230, ...markIn }}><SRMark size={200} /></div>
          {txt(160, 480, 30, { fontFamily: "Anton, Impact, sans-serif", letterSpacing: "0.08em", color: "rgba(243,238,228,.8)" }, "THANKS FOR WATCHING", 14)}
          {txt(160, 585, 96, { fontFamily: "Anton, Impact, sans-serif", letterSpacing: "0.01em", color: SR.cream }, <>SPORTS<span style={{ color: SR.red }}>ROOM</span></>, 18)}
          <div style={{ position: "absolute", left: bx, top: by, ...ent(24) }}><Pair ch="sr" fr={fr} C={P} B={B} g={geo} /></div>
          {txt(160, 770, 28, { fontFamily: "Anton, Impact, sans-serif", letterSpacing: "0.04em", color: "rgba(243,238,228,.75)" }, "SUBSCRIBING HELPS SUPPORT THE CHANNEL", 36)}
          {txt(1040, 272, 36, { fontFamily: "Anton, Impact, sans-serif", letterSpacing: "0.04em", color: SR.cream }, <>WATCH NEXT<div style={{ width: 120, height: 4, background: SR.red, marginTop: 8 }} /></>, 30)}
          <div style={{ position: "absolute", left: 1040, top: 300, width: 760, height: 428, borderRadius: 4, background: "rgba(28,25,22,.5)", boxShadow: `inset 6px 0 0 ${SR.red}`, ...ent(32) }} />
        </>
      )}
      <div style={{ position: "absolute", left: cur.x - 3, top: cur.y - 1, opacity: cur.op, transform: `scale(${cur.sc})`, transformOrigin: "3px 1px" }}><Cursor h={42} /></div>
    </AbsoluteFill>
  );
};

// ---------- wiring for a long ----------
// timeline.json "subkit": {channel, film_end, pops: [seconds], P, B}. Total duration (timeline "end") = film_end + 5 s.
export const withSubkit = (Film: React.FC, TL: any): React.FC => {
  const Wrapped: React.FC = () => {
    const sk = TL.subkit;
    if (!sk) return <Film />;
    const fe = Math.round(sk.film_end * FPS);
    return (
      <AbsoluteFill style={{ background: "#000" }}>
        <Sequence durationInFrames={fe}><Film /></Sequence>
        {(sk.pops as number[]).map((a, i) => <Sequence key={`sk${i}`} from={Math.round(a * FPS)} durationInFrames={POP_LEN}><Popup ch={sk.channel} /></Sequence>)}
        <Sequence from={fe} durationInFrames={END_LEN}>
          <EndCard ch={sk.channel} P={sk.P} B={sk.B} bg={<Freeze frame={fe - 1}><Film /></Freeze>} />
        </Sequence>
      </AbsoluteFill>
    );
  };
  return Wrapped;
};
