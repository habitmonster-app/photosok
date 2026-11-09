"""Generate original, redistributable HEIC test artwork; no external images.

Requirements used: pillow-heif==1.8.1, Pillow==13.0.0.
Run with a Python environment containing those packages.
"""
from pathlib import Path
from PIL import Image, ImageDraw
from pillow_heif import register_heif_opener

register_heif_opener()
destination = Path(__file__).parent / 'fixtures'
destination.mkdir(exist_ok=True)
for name, width, height in [('heic-colors', 640, 480), ('heic-large-colors', 4200, 3000)]:
    image = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(image)
    half_w, half_h = width // 2, height // 2
    draw.rectangle((0, 0, half_w - 1, half_h - 1), fill=(230, 35, 35))
    draw.rectangle((half_w, 0, width - 1, half_h - 1), fill=(25, 200, 65))
    draw.rectangle((0, half_h, half_w - 1, height - 1), fill=(35, 65, 225))
    draw.rectangle((half_w, half_h, width - 1, height - 1), fill=(240, 200, 20))
    image.save(destination / f'{name}.heic', format='HEIF', quality=90)
    if name == 'heic-colors':
        image.save(destination / 'heic-colors-reference.png')
    with Image.open(destination / f'{name}.heic') as decoded:
        assert decoded.size == (width, height)
    print(name, width, height, (destination / f'{name}.heic').stat().st_size)
