#!/bin/zsh
# Upscales + center-crops the localized ChatGPT source screenshots in
# screenshots/source/Apple/{iphone,ipad,mac}/<lang>/ to exact App Store sizes
# and writes JPEGs to screenshots/app-store-ready/<asc-locale>/<device>/N.jpg.
# Add a new language folder under source and re-run; existing output is rebuilt.
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../screenshots"
OUT=app-store-ready
loc() { case "$1" in
  TR|tr) echo tr;; Fr|fr) echo fr-FR;; arabic|arapca|ar) echo ar-SA;; cheness|cince|zh) echo zh-Hans;;
  es) echo es-ES;; hintce|hitce|hi) echo hi;; it) echo it;; de|almanca) echo de-DE;; pt|portekiz|portekizce) echo pt-PT;;
  ru|rusca) echo ru;; ja|jp|japonca) echo ja;; *) echo "";; esac; }
process() { # device-folder source-folder W H [max-ratio-diff]
  dev=$1; W=$3; H=$4; TOL=${5:-0.10}
  for d in source/Apple/$2/*/; do
    l=$(loc "$(basename "$d")"); [ -z "$l" ] && continue
    rm -rf "$OUT/$l/$dev"; mkdir -p "$OUT/$l/$dev"; i=0
    find "$d" -maxdepth 1 \( -name "*.png" -o -name "*.jpg" \) | sort | while read -r f; do
      i=$((i+1)); out="$OUT/$l/$dev/$i.png"  # .jpg is written
      /usr/bin/python3 "$SCRIPT_DIR/fit-screenshot.py" "$f" "${out%.png}.jpg" $W $H $TOL
    done
    echo "$l/$dev: $(ls "$OUT/$l/$dev" | wc -l | tr -d ' ') files"
  done
}
process iphone-6.5 iphone 1242 2688 0.20  # phone mocks tolerate a side crop
process ipad-13   ipad   2752 2064
process mac       mac    2880 1800
