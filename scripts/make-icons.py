# Generates app icons (PWA + Android launcher) from code: blue rounded square with a white check.
import sys, os
from PIL import Image, ImageDraw
def icon(size, maskable=False, round_=False, fg_only=False):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    blue = (71, 114, 250, 255)
    if not fg_only:
        if maskable: d.rectangle([0, 0, S, S], fill=blue)
        elif round_: d.ellipse([0, 0, S - 1, S - 1], fill=blue)
        else:
            pad = int(S * 0.06); d.rounded_rectangle([pad, pad, S - pad, S - pad], radius=int(S * 0.22), fill=blue)
    scale = 0.62 if (maskable or fg_only) else 0.78
    c = S / 2; w = S * scale
    pts = [(c - w * 0.30, c + w * 0.02), (c - w * 0.08, c + w * 0.24), (c + w * 0.32, c - w * 0.22)]
    d.line(pts, fill=(255, 255, 255, 255), width=int(S * 0.085 * (scale / 0.78)), joint='curve')
    for p in (pts[0], pts[2]):
        r = S * 0.0425 * (scale / 0.78); d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=(255, 255, 255, 255))
    return img.resize((size, size), Image.LANCZOS)
out = sys.argv[1] if len(sys.argv) > 1 else 'public/icons'
os.makedirs(out, exist_ok=True)
icon(192).save(f'{out}/icon-192.png'); icon(512).save(f'{out}/icon-512.png'); icon(512, maskable=True).save(f'{out}/icon-maskable-512.png')
# Android launcher icons
if len(sys.argv) > 2:
    res = sys.argv[2]
    for dens, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
        dd = f'{res}/mipmap-{dens}'; os.makedirs(dd, exist_ok=True)
        icon(px).save(f'{dd}/ic_launcher.png'); icon(px, round_=True).save(f'{dd}/ic_launcher_round.png')
        fg = int(px * 108 / 48); icon(fg, fg_only=True).save(f'{dd}/ic_launcher_foreground.png')
print('icons written')

# Notification icons (white glyph on transparent) and splash screens for Android
def notif(px):
    S = px * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    c = S / 2; w = S * 0.9
    pts = [(c - w * 0.32, c + w * 0.02), (c - w * 0.09, c + w * 0.25), (c + w * 0.34, c - w * 0.24)]
    d.line(pts, fill=(255, 255, 255, 255), width=int(S * 0.14), joint='curve')
    return img.resize((px, px), Image.LANCZOS)
def splash(w, h):
    img = Image.new('RGBA', (w, h), (255, 255, 255, 255))
    s = int(min(w, h) * 0.28)
    ic = icon(s)
    img.paste(ic, ((w - s) // 2, (h - s) // 2), ic)
    return img.convert('RGB')
if len(sys.argv) > 2:
    res = sys.argv[2]
    for dens, px in {'mdpi': 24, 'hdpi': 36, 'xhdpi': 48, 'xxhdpi': 72, 'xxxhdpi': 96}.items():
        dd = f'{res}/drawable-{dens}'; os.makedirs(dd, exist_ok=True); notif(px).save(f'{dd}/ic_stat_taskday.png')
    sizes = {'drawable': (480, 320), 'drawable-land-mdpi': (480, 320), 'drawable-land-hdpi': (800, 480), 'drawable-land-xhdpi': (1280, 720), 'drawable-land-xxhdpi': (1600, 960), 'drawable-land-xxxhdpi': (1920, 1280),
             'drawable-port-mdpi': (320, 480), 'drawable-port-hdpi': (480, 800), 'drawable-port-xhdpi': (720, 1280), 'drawable-port-xxhdpi': (960, 1600), 'drawable-port-xxxhdpi': (1280, 1920)}
    for folder, (w, h) in sizes.items():
        dd = f'{res}/{folder}'; os.makedirs(dd, exist_ok=True); splash(w, h).save(f'{dd}/splash.png')
    print('android resources written')
