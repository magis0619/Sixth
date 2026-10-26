# Fluent Emoji（Microsoft・MIT ライセンス）の3D画像を取ってきて、ゲーム用の絵に整える。
# 使い方: python3 scripts/build-art.py
# 出力: src/assets/art/<id>.webp（160px 四方・まわりに濃い茶の輪郭線）
# 輪郭線は、手描きの SVG（濃い茶の 3px の線）と並べたときに浮かないように付ける。
import io, os, sys, urllib.parse, urllib.request
from PIL import Image, ImageFilter

BASE = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets'
# ゲームの絵の id → Fluent Emoji のフォルダ名・ファイル名
SOURCES = {
    'tomato': ('Tomato', 'tomato'),
    'strawberry': ('Strawberry', 'strawberry'),
    'melon': ('Melon', 'melon'),
    'watermelon': ('Watermelon', 'watermelon'),
    'corn': ('Ear of corn', 'ear_of_corn'),
    'sun': ('Sun with face', 'sun_with_face'),
    'rain': ('Cloud with rain', 'cloud_with_rain'),
    'bee': ('Honeybee', 'honeybee'),
    'bug': ('Bug', 'bug'),
    'tanuki': ('Raccoon', 'raccoon'),
    'clover': ('Four leaf clover', 'four_leaf_clover'),
    'thunder': ('High voltage', 'high_voltage'),
    'moon': ('Full moon face', 'full_moon_face'),
    'frost': ('Snowflake', 'snowflake'),
}
# 色の手直し（元の絵のままだとゲームの物に見えないもの）
# hue：色相を度で回す、tint：灰色の部分をこの色に寄せる
ADJUST = {
    'tomato': {'hue': 12},  # ピンク寄り → 赤
    'tanuki': {'tint': (150, 104, 62)},  # 灰色のアライグマ → 茶色のタヌキ
}
SIZE = 160
INK = (61, 51, 38, 255)  # 手描きの SVG と同じ濃い茶
OUTLINE = 7  # 輪郭線の太さ（160px のとき）
CACHE = os.path.join(os.path.dirname(__file__), '..', 'node_modules', '.cache', 'fluent')
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'art')


def fetch(folder: str, name: str) -> Image.Image:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f'{name}.png')
    if not os.path.exists(path):
        url = f'{BASE}/{urllib.parse.quote(folder)}/3D/{name}_3d.png'
        with urllib.request.urlopen(url) as r, open(path, 'wb') as f:
            f.write(r.read())
    return Image.open(path).convert('RGBA')


def adjust(img: Image.Image, opt: dict) -> Image.Image:
    import numpy as np
    a = np.asarray(img).astype(np.float32) / 255
    rgb, alpha = a[..., :3], a[..., 3:]
    if 'hue' in opt:
        hsv = np.asarray(img.convert('RGB').convert('HSV')).astype(np.float32)
        hsv[..., 0] = (hsv[..., 0] + opt['hue'] * 255 / 360) % 255
        rgb = np.asarray(Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB')).astype(np.float32) / 255
    if 'tint' in opt:
        # 彩度の低い所ほど、明るさを保ったまま指定の色に寄せる
        t = np.array(opt['tint'], np.float32) / 255
        lum = rgb.mean(axis=2, keepdims=True)
        sat = rgb.max(axis=2, keepdims=True) - rgb.min(axis=2, keepdims=True)
        w = np.clip(1 - sat * 4, 0, 1) * np.clip((lum - 0.12) * 3, 0, 1) * np.clip((0.97 - lum) * 6, 0, 1)
        tinted = np.clip(t * lum / t.mean(), 0, 1)
        rgb = rgb * (1 - w) + tinted * w
    out = np.concatenate([rgb, alpha], axis=2)
    return Image.fromarray((out * 255).astype(np.uint8), 'RGBA')


def outlined(img: Image.Image) -> Image.Image:
    # 絵を少し小さくして余白を作り、透明でない所を太らせた影絵を濃い茶で後ろに敷く
    inner = SIZE - OUTLINE * 2 - 4
    img = img.resize((inner, inner), Image.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(img, ((SIZE - inner) // 2, (SIZE - inner) // 2))
    alpha = canvas.getchannel('A').point(lambda a: 255 if a > 40 else 0)
    grown = alpha.filter(ImageFilter.MaxFilter(OUTLINE * 2 + 1)).filter(ImageFilter.GaussianBlur(0.8))
    ink = Image.new('RGBA', (SIZE, SIZE), INK)
    ink.putalpha(grown)
    ink.alpha_composite(canvas)
    return ink


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[1:])
    for id_, (folder, name) in SOURCES.items():
        if only and id_ not in only:
            continue
        img = fetch(folder, name)
        if id_ in ADJUST:
            img = adjust(img, ADJUST[id_])
        img = outlined(img)
        img.save(os.path.join(OUT, f'{id_}.webp'), 'WEBP', quality=88, method=6)
        print('ok', id_)


main()
