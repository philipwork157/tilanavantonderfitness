from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import subprocess


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps" / "web" / "public"
OUTPUT = ROOT / "artifacts" / "social"
FRAMES = OUTPUT / "launch-reel-frames"

W, H = 1080, 1920
CREAM = "#F6E4D9"
BLUSH = "#EBD0C0"
TERRACOTTA = "#D9A17C"
CARAMEL = "#AD8065"
SAGE = "#CBD5B4"
INK = "#111012"
CHOCOLATE = "#674D3E"
WHITE = "#FFF9F5"

HEADING = "/System/Library/Fonts/NewYork.ttf"
BODY = "/System/Library/Fonts/Avenir.ttc"
SCRIPT = "/System/Library/Fonts/Supplemental/Savoye LET.ttc"


def font(path, size, index=0):
    return ImageFont.truetype(path, size=size, index=index)


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask


def cover_image(path, box, focus=(0.5, 0.42), radius=0):
    source = Image.open(path).convert("RGB")
    target_w, target_h = box
    scale = max(target_w / source.width, target_h / source.height)
    resized = source.resize((round(source.width * scale), round(source.height * scale)), Image.Resampling.LANCZOS)
    x = max(0, min(resized.width - target_w, round((resized.width - target_w) * focus[0])))
    y = max(0, min(resized.height - target_h, round((resized.height - target_h) * focus[1])))
    cropped = resized.crop((x, y, x + target_w, y + target_h))
    if radius:
        cropped.putalpha(rounded_mask(cropped.size, radius))
    return cropped


def wrap(draw, text, fnt, max_width):
    words = text.split()
    lines, line = [], ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=fnt)[2] <= max_width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def draw_lines(draw, lines, xy, fnt, fill, spacing=12, anchor="la"):
    x, y = xy
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill, anchor=anchor)
        y += fnt.size + spacing
    return y


def eyebrow(draw, text, y, center=False):
    fnt = font(BODY, 28, 1)
    x = W // 2 if center else 82
    draw.text((x, y), text.upper(), font=fnt, fill=CARAMEL, anchor="ma" if center else "la", stroke_width=0)


def add_grain(image):
    # A faint warm overlay keeps the scenes from looking clinically flat.
    overlay = Image.new("RGBA", image.size, (173, 128, 101, 0))
    return Image.alpha_composite(image.convert("RGBA"), overlay)


def new_canvas(color=CREAM):
    return Image.new("RGBA", (W, H), color)


def scene_one():
    im = new_canvas()
    photo = cover_image(PUBLIC / "tilana-blog-welcome.jpg", (870, 1050), focus=(0.5, 0.30), radius=430)
    shadow = Image.new("RGBA", (910, 1090), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse((20, 20, 890, 1070), fill=(103, 77, 62, 50))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    im.alpha_composite(shadow, (85, 535))
    im.alpha_composite(photo, (105, 535))
    d = ImageDraw.Draw(im)
    eyebrow(d, "A new chapter begins", 120, center=True)
    d.text((W // 2, 245), "Tilana van Tonder", font=font(SCRIPT, 112), fill=CARAMEL, anchor="ma")
    d.text((W // 2, 375), "THE WEBSITE", font=font(BODY, 27, 1), fill=CHOCOLATE, anchor="ma")
    d.text((W // 2, 432), "is here.", font=font(HEADING, 82), fill=INK, anchor="ma")
    d.rounded_rectangle((330, 1700, 750, 1776), radius=38, fill=TERRACOTTA)
    d.text((540, 1738), "WELCOME", font=font(BODY, 25, 1), fill=INK, anchor="mm")
    return im


def scene_two():
    im = new_canvas(BLUSH)
    photo = cover_image(PUBLIC / "tilana-strength-training.jpg", (916, 780), focus=(0.44, 0.48), radius=54)
    im.alpha_composite(photo, (82, 170))
    d = ImageDraw.Draw(im)
    eyebrow(d, "Strength for real life", 1060)
    heading = font(HEADING, 83)
    draw_lines(d, ["Move better.", "Feel stronger."], (82, 1140), heading, INK, spacing=2)
    d.text((82, 1360), "Live healthier.", font=font(SCRIPT, 92), fill=CARAMEL)
    body = font(BODY, 33)
    lines = wrap(d, "Realistic movement and nourishment, designed to fit the life you actually live.", body, 900)
    draw_lines(d, lines, (82, 1510), body, CHOCOLATE, spacing=18)
    return im


def scene_three():
    im = new_canvas(CREAM)
    d = ImageDraw.Draw(im)
    eyebrow(d, "Programs for real life", 150)
    d.text((82, 225), "Choose your", font=font(HEADING, 88), fill=INK)
    d.text((82, 320), "next step.", font=font(SCRIPT, 106), fill=CARAMEL)
    cards = [
        ("BEGINNER", "Build a confident foundation.", SAGE),
        ("INTERMEDIATE", "Turn your foundation into progress.", BLUSH),
        ("ADVANCED", "Train with greater purpose.", TERRACOTTA),
        ("RECONNECT", "Reconnect with your pelvic floor.", SAGE),
        ("NOURISH", "Understand how to fuel your body.", BLUSH),
    ]
    y = 525
    title_font = font(BODY, 27, 1)
    body_font = font(HEADING, 38)
    for index, (title, copy, accent) in enumerate(cards, 1):
        d.rounded_rectangle((82, y, 998, y + 205), radius=34, fill=WHITE, outline="#DDBFAE", width=2)
        d.rounded_rectangle((82, y, 98, y + 205), radius=8, fill=accent)
        d.ellipse((126, y + 61, 210, y + 145), fill=accent)
        d.text((168, y + 103), f"{index:02}", font=font(BODY, 24, 1), fill=INK, anchor="mm")
        d.text((248, y + 54), title, font=title_font, fill=CARAMEL)
        lines = wrap(d, copy, body_font, 690)
        draw_lines(d, lines, (248, y + 100), body_font, INK, spacing=3)
        y += 235
    return im


def scene_four():
    im = new_canvas(SAGE)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((62, 92, 1018, 1805), radius=62, fill=WHITE, outline="#B9C59E", width=2)
    photo = cover_image(PUBLIC / "tilana-blog-welcome.jpg", (876, 760), focus=(0.5, 0.22), radius=44)
    im.alpha_composite(photo, (102, 132))
    d.rounded_rectangle((124, 846, 438, 918), radius=36, fill=SAGE)
    d.text((281, 882), "THE FIRST BLOG", font=font(BODY, 21, 1), fill=INK, anchor="mm")
    d.text((914, 882), "4 MIN READ", font=font(BODY, 21, 1), fill=CARAMEL, anchor="ra")
    heading = font(HEADING, 70)
    d.text((124, 1000), "Welcome —", font=heading, fill=INK)
    d.text((124, 1082), "a little about me", font=heading, fill=INK)
    body = font(BODY, 29)
    copy = "A personal letter about movement, motherhood, food, confidence and learning that your worth is never measured by a number on the scale."
    draw_lines(d, wrap(d, copy, body, 820), (124, 1215), body, CHOCOLATE, spacing=15)
    d.text((124, 1505), "With love, Tilana", font=font(SCRIPT, 68), fill=CARAMEL)
    d.rounded_rectangle((124, 1640, 486, 1724), radius=42, fill=TERRACOTTA)
    d.text((282, 1682), "READ THE STORY", font=font(BODY, 22, 1), fill=INK, anchor="mm")
    d.line((406, 1682, 447, 1682), fill=INK, width=3)
    d.line((435, 1670, 447, 1682, 435, 1694), fill=INK, width=3, joint="curve")
    return im


def scene_five():
    im = new_canvas(INK)
    d = ImageDraw.Draw(im)
    d.ellipse((-330, -270, 600, 660), fill="#332B2C")
    d.ellipse((700, 1460, 1320, 2080), fill="#75654B")
    d.text((540, 440), "“", font=font(HEADING, 230), fill=TERRACOTTA, anchor="mm")
    quote_font = font(HEADING, 68)
    lines = wrap(d, "My worth is not measured by a number on the scale.", quote_font, 850)
    draw_lines(d, lines, (540, 690), quote_font, WHITE, spacing=20, anchor="ma")
    d.line((385, 1215, 695, 1215), fill=CARAMEL, width=3)
    d.text((540, 1295), "TILANA VAN TONDER", font=font(BODY, 25, 1), fill=TERRACOTTA, anchor="ma")
    return im


def scene_six():
    im = new_canvas(CREAM)
    photo = cover_image(PUBLIC / "tilana-home.jpg", (1080, 1920), focus=(0.5, 0.36))
    photo = photo.filter(ImageFilter.GaussianBlur(1.2)).convert("RGBA")
    overlay = Image.new("RGBA", (W, H), (17, 16, 18, 148))
    im = Image.alpha_composite(photo, overlay)
    d = ImageDraw.Draw(im)
    eyebrow(d, "Now open", 420, center=True)
    d.text((540, 550), "Come as you are.", font=font(HEADING, 83), fill=WHITE, anchor="ma")
    d.text((540, 670), "Start where you are.", font=font(SCRIPT, 103), fill=TERRACOTTA, anchor="ma")
    body = font(BODY, 32)
    lines = wrap(d, "Explore the programs and read Tilana’s first story today.", body, 760)
    draw_lines(d, lines, (540, 860), body, WHITE, spacing=15, anchor="ma")
    d.rounded_rectangle((168, 1130, 912, 1235), radius=53, fill=TERRACOTTA)
    d.text((540, 1182), "TILANAVANTONDER.CO.ZA", font=font(BODY, 28, 1), fill=INK, anchor="mm")
    d.text((540, 1580), "Strength  ·  Movement  ·  Nourishment", font=font(BODY, 23), fill=WHITE, anchor="ma")
    return im


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    FRAMES.mkdir(parents=True, exist_ok=True)
    scenes = [scene_one(), scene_two(), scene_three(), scene_four(), scene_five(), scene_six()]
    paths = []
    for index, scene in enumerate(scenes, 1):
        path = FRAMES / f"scene-{index}.png"
        add_grain(scene).convert("RGB").save(path, quality=96)
        paths.append(path)

    scenes[0].convert("RGB").save(OUTPUT / "tilana-launch-reel-cover.jpg", quality=94)

    command = ["ffmpeg", "-y"]
    for path in paths:
        command.extend(["-loop", "1", "-t", "3.5", "-i", str(path)])
    filters = []
    for index in range(len(paths)):
        filters.append(
            f"[{index}:v]scale=1120:1992,crop=1080:1920,"
            f"zoompan=z='min(zoom+0.00012,1.018)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"d=105:s=1080x1920:fps=30,format=yuv420p[v{index}]"
        )
    previous = "v0"
    for index in range(1, len(paths)):
        output = "vout" if index == len(paths) - 1 else f"x{index}"
        offset = 3.0 * index
        filters.append(f"[{previous}][v{index}]xfade=transition=fade:duration=0.5:offset={offset}[{output}]")
        previous = output
    command.extend([
        "-filter_complex", ";".join(filters),
        "-map", "[vout]",
        "-t", "18.5",
        "-r", "30",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(OUTPUT / "tilana-website-launch-reel.mp4"),
    ])
    subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
