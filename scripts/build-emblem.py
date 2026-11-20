# The OPV emblem as alpha masks, tinted in CSS (components/Emblem.tsx):
#   bone.png   the engraved art (skull, horns, sword, the cross's rim), 384 px
#   plate.png  the cross's dark body, 384 px
#   glyph.png  one-colour icon: skull, horns and sword solid, the cross at 30%, 96 px
# Needs Pillow and NumPy: python3 scripts/build-emblem.py [art/emblem/opv-logo.png]
import sys, pathlib, numpy as np
from PIL import Image, ImageFilter

root = pathlib.Path(__file__).resolve().parent.parent
src = sys.argv[1] if len(sys.argv) > 1 else root / "art/emblem/opv-logo.png"
out = root / "public/assets/emblem"
out.mkdir(parents=True, exist_ok=True)

im = np.array(Image.open(src).convert("RGBA")).astype(float)
alpha = im[..., 3] / 255
t = np.clip((im[..., :3].mean(-1) - 50) / 140, 0, 1)
t = t * t * (3 - 2 * t)  # cream → 1, black → 0

# Square crop about the emblem.
ys, xs = np.where(alpha > 0.08)
cx, cy = (xs.min() + xs.max() + 1) // 2, (ys.min() + ys.max() + 1) // 2
side = int(max(xs.max() + 1 - xs.min(), ys.max() + 1 - ys.min()))
pad = np.zeros((im.shape[0] + 2 * side, im.shape[1] + 2 * side))
def square(m):
    p = pad.copy(); p[side:side + m.shape[0], side:side + m.shape[1]] = m
    y0, x0 = cy - side // 2 + side, cx - side // 2 + side
    return Image.fromarray((p[y0:y0 + side, x0:x0 + side] * 255).astype(np.uint8), "L")

def save(mask, name, size):
    m = mask.resize((size, size), Image.LANCZOS)
    Image.merge("LA", (Image.new("L", m.size, 255), m)).save(out / name, optimize=True)

bone, plate, whole = square(alpha * t), square(alpha * (1 - t)), square(alpha)
save(bone, "bone.png", 384)
save(plate, "plate.png", 384)

# The glyph, worked at 512 px: close the engraving into solid shapes, open
# away the thin rim lines, and lay the whole emblem under it at 30%.
solid = bone.resize((512, 512), Image.LANCZOS).point(lambda p: 255 if p > 110 else 0)
solid = solid.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(7))
solid = solid.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(1.2))
glyph = np.maximum(np.array(whole.resize((512, 512), Image.LANCZOS)) / 255 * 0.3, np.array(solid) / 255)
save(Image.fromarray((glyph * 255).astype(np.uint8), "L"), "glyph.png", 96)
print("emblem →", out.relative_to(root), sorted(f"{p.name} {p.stat().st_size // 1024} KB" for p in out.iterdir()))

# The favicon, in colour: the cross in dark iron with a brass rim, the skull,
# horns and sword solid brass, so it reads on light and dark tab bars alike.
w = np.array(whole.resize((512, 512), Image.LANCZOS)) / 255
inner = np.array(whole.resize((512, 512), Image.LANCZOS).filter(ImageFilter.MinFilter(15))) / 255
rim = np.clip(w - inner, 0, 1)
s = np.array(solid) / 255
yy = np.linspace(0, 1, 512)[:, None, None]
brass = np.array([240, 216, 158]) * (1 - yy) + np.array([168, 128, 64]) * yy
iron = np.array([30, 26, 32])
rgb = iron * (1 - np.maximum(rim * 0.85, s)[..., None]) + brass * np.maximum(rim * 0.85, s)[..., None]
fav = Image.fromarray(np.dstack([rgb, w * 255]).clip(0, 255).astype(np.uint8), "RGBA").resize((64, 64), Image.LANCZOS)
fav.save(root / "public/favicon.png", optimize=True)
print("favicon → public/favicon.png", (root / "public/favicon.png").stat().st_size // 1024, "KB")
