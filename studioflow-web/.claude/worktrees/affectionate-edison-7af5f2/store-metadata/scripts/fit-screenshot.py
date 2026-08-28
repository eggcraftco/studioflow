#!/usr/bin/python3
"""Resize one source screenshot to an exact App Store size.

If the source aspect ratio is within 10% of the target, scale-to-cover and
center-crop (no visible change). Otherwise scale-to-fit and pad with the
average colour of the source's outer border, so headlines never get cut.

usage: fit-screenshot.py SRC DST WIDTH HEIGHT [MAX_RATIO_DIFF=0.10]
"""
import sys
from PIL import Image, ImageStat

src, dst, W, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
max_diff = float(sys.argv[5]) if len(sys.argv) > 5 else 0.10
im = Image.open(src).convert("RGB")
w, h = im.size
ratio_diff = abs((w / h) / (W / H) - 1)

if ratio_diff <= max_diff:
    s = max(W / w, H / h)
    im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    left, top = (im.width - W) // 2, (im.height - H) // 2
    out = im.crop((left, top, left + W, top + H))
else:
    s = min(W / w, H / h)
    fitted = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    # average colour of a thin border strip → padding colour
    b = max(2, min(w, h) // 50)
    strips = [im.crop((0, 0, w, b)), im.crop((0, h - b, w, h)), im.crop((0, 0, b, h)), im.crop((w - b, 0, w, h))]
    acc = [0, 0, 0]
    for st in strips:
        m = ImageStat.Stat(st).mean
        acc = [a + v for a, v in zip(acc, m)]
    colour = tuple(int(v / len(strips)) for v in acc)
    out = Image.new("RGB", (W, H), colour)
    out.paste(fitted, ((W - fitted.width) // 2, (H - fitted.height) // 2))
    print(f"  padded {src.split('/')[-1]} ({w}x{h}) with {colour}", file=sys.stderr)

out.save(dst, "JPEG", quality=95)
