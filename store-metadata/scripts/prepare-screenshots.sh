#!/bin/zsh
# Upscales + center-crops the localized ChatGPT source screenshots in
# screenshots/source/Apple/{iphone,ipad,mac}/<lang>/ to exact App Store sizes
# and writes JPEGs to screenshots/app-store-ready/<asc-locale>/<device>/N.jpg.
# Add a new language folder under source and re-run; existing output is rebuilt.
set -e
cd "$(dirname "$0")/../screenshots"
OUT=app-store-ready
loc() { case "$1" in
  TR|tr) echo tr;; Fr|fr) echo fr-FR;; arabic|ar) echo ar-SA;; cheness|zh) echo zh-Hans;;
  es) echo es-ES;; hintce|hitce|hi) echo hi;; it) echo it;; de) echo de-DE;; pt) echo pt-PT;;
  ru) echo ru;; ja|jp) echo ja;; *) echo "";; esac; }
process() { # device-folder source-folder W H
  dev=$1; W=$3; H=$4
  for d in source/Apple/$2/*/; do
    l=$(loc "$(basename "$d")"); [ -z "$l" ] && continue
    rm -rf "$OUT/$l/$dev"; mkdir -p "$OUT/$l/$dev"; i=0
    find "$d" -maxdepth 1 \( -name "*.png" -o -name "*.jpg" \) | sort | while read -r f; do
      i=$((i+1)); out="$OUT/$l/$dev/$i.png"
      read w h < <(sips -g pixelWidth -g pixelHeight "$f" | awk '/pixel/{printf "%s ", $2}')
      sw=$(python3 -c "import math;s=max($W/$w,$H/$h);print(math.ceil($w*s))")
      sh=$(python3 -c "import math;s=max($W/$w,$H/$h);print(math.ceil($h*s))")
      sips -s format png --resampleHeightWidth $sh $sw "$f" --out "$out" >/dev/null
      sips -c $H $W "$out" >/dev/null
      sips -s format jpeg -s formatOptions 95 "$out" --out "${out%.png}.jpg" >/dev/null && rm "$out"
    done
    echo "$l/$dev: $(ls "$OUT/$l/$dev" | wc -l | tr -d ' ') files"
  done
}
process iphone-6.5 iphone 1242 2688
process ipad-13   ipad   2752 2064
process mac       mac    2880 1800
