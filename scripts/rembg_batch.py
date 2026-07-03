"""
Batch bg-removal: process all PNGs in <tmp_dir>, save as WebP with alpha to <out_dir>.
Usage: python scripts/rembg_batch.py <tmp_dir> <out_dir>
"""
import sys, os, io
from rembg import remove, new_session
from PIL import Image

tmp_dir = sys.argv[1]
out_dir = sys.argv[2]
os.makedirs(out_dir, exist_ok=True)

pngs = sorted(f for f in os.listdir(tmp_dir) if f.endswith('.png'))
print(f"Processing {len(pngs)} frames from {tmp_dir} -> {out_dir}")

session = new_session('u2net')

for i, fname in enumerate(pngs):
    name = fname.replace('.png', '')
    inp = os.path.join(tmp_dir, fname)
    out = os.path.join(out_dir, name + '.webp')
    if os.path.exists(out):
        print(f"  {i+1:2}/{len(pngs)} {name}.webp — skip (exists)")
        continue
    with open(inp, 'rb') as f:
        data = f.read()
    result = remove(data, session=session)
    img = Image.open(io.BytesIO(result)).convert('RGBA')
    img.save(out, 'WEBP', quality=90)
    kb = os.path.getsize(out) / 1024
    print(f"  {i+1:2}/{len(pngs)} {name}.webp  {kb:.1f}KB")

print(f"\nDone: {len(pngs)} frames in {out_dir}/")