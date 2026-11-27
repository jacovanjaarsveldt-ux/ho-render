import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, continueRender, delayRender, registerRoot, Composition } from "remotion";
import { Popup, EndCard, POP_LEN, END_LEN, Ch } from "./SubscribeKit";
// Preview clips for Jaco (27 Nov 2026). public/: fonts, seg.mp4 (12 s of a finished long, muted here; audio is muxed from mix.wav), last.png (that long's last frame).
// PopHO/PopSR: 12 s, pop-up starts at 2.5 s. EndHO/EndSR: the 5 s end card. P/B come from the voice line timings (lib/subkit/assets/endcard_<ch>.json).
const h = delayRender("fonts");
const FONTS: [string, string, string][] = [["Cinzel", "Cinzel-900.woff2", "900"], ["Cinzel", "Cinzel-700.woff2", "700"], ["Archivo", "Archivo-800.woff2", "800"], ["Archivo", "Archivo-900.woff2", "900"], ["Anton", "Anton.woff2", "400"]];
Promise.all(FONTS.map(([n, f, w]) => new FontFace(n, `url(${staticFile(f)}) format("woff2")`, { weight: w }).load().then((ff) => (document.fonts as any).add(ff)).catch(() => null)))
  .then(() => continueRender(h));
const Pop: React.FC<{ ch: Ch }> = ({ ch }) => <AbsoluteFill style={{ background: "#000" }}>
  <OffthreadVideo src={staticFile("seg.mp4")} muted style={{ width: "100%", height: "100%" }} />
  <Sequence from={75} durationInFrames={POP_LEN}><Popup ch={ch} /></Sequence>
</AbsoluteFill>;
const End: React.FC<{ ch: Ch; P: number; B: number }> = ({ ch, P, B }) => <EndCard ch={ch} P={P} B={B} bg={<Img src={staticFile("last.png")} style={{ width: "100%", height: "100%" }} />} />;
const K = { fps: 30, width: 1920, height: 1080 };
registerRoot(() => <>
  <Composition id="PopHO" component={Pop} defaultProps={{ ch: "ho" as Ch }} durationInFrames={360} {...K} />
  <Composition id="PopSR" component={Pop} defaultProps={{ ch: "sr" as Ch }} durationInFrames={360} {...K} />
  <Composition id="EndHO" component={End} defaultProps={{ ch: "ho" as Ch, P: 52, B: 90 }} durationInFrames={END_LEN} {...K} />
  <Composition id="EndSR" component={End} defaultProps={{ ch: "sr" as Ch, P: 52, B: 86 }} durationInFrames={END_LEN} {...K} />
</>);
