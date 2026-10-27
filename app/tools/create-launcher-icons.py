from pathlib import Path
from PIL import Image, ImageDraw

dest = Path(__file__).resolve().parent.parent / 'launcher-icons'
dest.mkdir(exist_ok=True)
for name, color in [('start', '#21A366'), ('stop', '#D94B55')]:
    image = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((8, 8, 248, 248), radius=56, fill=color)
    if name == 'start':
        draw.polygon([(100, 65), (100, 191), (192, 128)], fill='white')
    else:
        draw.rounded_rectangle((77, 77, 179, 179), radius=10, fill='white')
    image.save(dest / (name + '.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('Launcher icons created')
