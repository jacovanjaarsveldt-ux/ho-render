#!/bin/bash
# QA strips for AI clips: every clip at 2 fps, tiled, plus a clip info line. Run on the Actions machine, not the laptop.
D="$1"; mkdir -p out/strips
for f in "$D"/*.mp4; do
  b=$(basename "$f" .mp4)
  ffprobe -v error -show_entries stream=width,height,r_frame_rate,duration -of csv=p=0 "$f" | head -1 | sed "s/^/$b: /" >> out/strips/info.txt
  ffmpeg -v error -y -i "$f" -vf "fps=2,scale=320:-2,tile=8x2" -frames:v 1 -q:v 3 "out/strips/$b.jpg"
done
cat out/strips/info.txt
