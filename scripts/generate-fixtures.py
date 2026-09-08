"""Self-authored geometric test art. Pillow 12.0.0 with libwebp; no external images."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
fixtures = root / "tests" / "fixtures"
fixtures.mkdir(parents=True, exist_ok=True)
art = Image.new("RGB", (640, 400), "#e9eddd")
draw = ImageDraw.Draw(art)
draw.rectangle((40, 40, 600, 360), fill="#214e3b")
draw.ellipse((320, 80, 550, 310), fill="#dcea80")
draw.polygon([(85, 300), (210, 90), (335, 300)], fill="#f6f4e7")
draw.rectangle((105, 325, 535, 329), fill="#abbf86")
art.save(fixtures / "lossy.webp", quality=80, method=6)
art.save(fixtures / "lossless.webp", lossless=True, method=6)
transparent = Image.new("RGBA", (320, 240), (0, 0, 0, 0))
draw = ImageDraw.Draw(transparent)
draw.rounded_rectangle((45, 35, 275, 205), radius=28, fill=(33, 78, 59, 255))
draw.ellipse((110, 70, 210, 170), fill=(221, 234, 128, 128))
transparent.save(fixtures / "transparent.webp", lossless=True, method=6)
frame2 = art.copy()
ImageDraw.Draw(frame2).rectangle((50, 50, 180, 180), fill="#e88c55")
art.save(fixtures / "animated.webp", save_all=True, append_images=[frame2], duration=180, loop=0, lossless=True)
Image.new("RGB", (6000, 4000), "#dcea80").save(fixtures / "over-pixels.webp", lossless=True)
(fixtures / "truncated.webp").write_bytes((fixtures / "lossy.webp").read_bytes()[:45])
(fixtures / "empty.webp").write_bytes(b"")
art.save(fixtures / "disguised.webp", format="PNG")
# Complete RIFF/chunk headers with a deliberately broken VP8 compressed payload.
damaged = bytearray((fixtures / "lossy.webp").read_bytes()[:30])
# Keep legal keyframe dimensions but no compressed partition data.
damaged[4:8] = (len(damaged) - 8).to_bytes(4, "little")
damaged[16:20] = (10).to_bytes(4, "little")
(fixtures / "damaged.webp").write_bytes(damaged)
public = root / "public" / "guide"
public.mkdir(parents=True, exist_ok=True)
for name in ["lossy.webp", "transparent.webp"]:
    (public / name).write_bytes((fixtures / name).read_bytes())
for path in sorted(fixtures.glob("*.webp")):
    print(f"{path.name}: {path.stat().st_size} bytes")
