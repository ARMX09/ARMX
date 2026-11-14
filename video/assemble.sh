#!/usr/bin/env bash
# يركّب اللقطات السبع + لقطة 4B (تجميد آخر فريم مع العبارة) في فيديو 40 ثانية
# الاستخدام: bash video/assemble.sh [music.mp3]
set -euo pipefail
cd "$(dirname "$0")"
MUSIC="${1:-}"
W=1920; H=1080; FPS=30; XF=0.5
mkdir -p build

# 1) توحيد المقاطع: 1080p، 30fps، 5 ثوانٍ بالضبط
for id in 1A 1B 2A 2B 3A 3B 4A; do
  ffmpeg -y -loglevel error -i "clips/$id.mp4" -an -t 5 \
    -vf "scale=$W:$H:force_original_aspect_ratio=increase,crop=$W:$H,fps=$FPS,format=yuv420p,tpad=stop_mode=clone:stop_duration=1" \
    -t 5 -c:v libx264 -crf 18 -preset medium "build/$id.mp4"
done

# 2) لقطة 4B: آخر فريم من 4A، تغميق تدريجي، والعبارة تظهر بـ Fade بطيء
ffmpeg -y -loglevel error -sseof -0.1 -i build/4A.mp4 -frames:v 1 -update 1 build/last.png
node render-text.js
ffmpeg -y -loglevel error -loop 1 -framerate $FPS -t 6.5 -i build/last.png \
  -loop 1 -framerate $FPS -t 6.5 -i build/line1.png -loop 1 -framerate $FPS -t 6.5 -i build/line2.png -filter_complex "\
[0:v]eq=brightness=-0.12:saturation=0.85,drawbox=c=black@0.25:t=fill[bg];\
[1:v]format=rgba,fade=t=in:st=0.8:d=1.2:alpha=1[t1];[2:v]format=rgba,fade=t=in:st=2.0:d=1.2:alpha=1[t2];\
[bg][t1]overlay[x];[x][t2]overlay,format=yuv420p,fade=t=out:st=5.4:d=1.1[v]" -map "[v]" -t 6.5 -c:v libx264 -crf 18 build/4B.mp4

# 3) الربط: Dissolve 0.5 ث بين المشاهد، وقطع مباشر داخل المشهد الواحد
inputs=(); for id in 1A 1B 2A 2B 3A 3B 4A 4B; do inputs+=(-i "build/$id.mp4"); done
# مدة كل جزء بعد القطع المباشر: كل مشهد 10 ث، والانتقالات تأكل 0.5 ث، فنعوضها بمدة 4B (6.5 ث) ليصبح الطول 40 ث
FILTER="[0:v][1:v]concat=n=2:v=1[s1];[2:v][3:v]concat=n=2:v=1[s2];[4:v][5:v]concat=n=2:v=1[s3];[6:v][7:v]concat=n=2:v=1[s4];\
[s1][s2]xfade=transition=dissolve:duration=$XF:offset=$(echo "10-$XF" | bc)[a];\
[a][s3]xfade=transition=dissolve:duration=$XF:offset=$(echo "20-2*$XF" | bc)[b];\
[b][s4]xfade=transition=dissolve:duration=$XF:offset=$(echo "30-3*$XF" | bc),trim=0:40,fade=t=in:st=0:d=0.6[v]"

if [[ -n "$MUSIC" ]]; then
  ffmpeg -y -loglevel error "${inputs[@]}" -i "$MUSIC" -filter_complex "$FILTER;[8:a]atrim=0:40,afade=t=in:d=1,afade=t=out:st=37:d=3[aud]" \
    -map "[v]" -map "[aud]" -c:v libx264 -crf 18 -preset slow -c:a aac -b:a 192k -movflags +faststart -t 40 final.mp4
else
  ffmpeg -y -loglevel error "${inputs[@]}" -filter_complex "$FILTER" -map "[v]" \
    -c:v libx264 -crf 18 -preset slow -movflags +faststart -t 40 final.mp4
fi
ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate -of compact final.mp4
