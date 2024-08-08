import pandas as pd
from PIL import Image, ImageFont, ImageDraw
import os

# Locate your font
FONT_NAME = "/usr/share/fonts/TTF/times.ttf"
FONT_COLOR = "#000000"

def make_certificates(df, name_column, template_file, output_dir, vertical_offset, font_size):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    names = df[name_column].tolist()
    font = ImageFont.truetype(FONT_NAME, font_size)

    for name in names:
        name = str(name).upper()  # Change all names to capital letters

        template = Image.open(template_file)
        width, height = template.size

        image_source = template.copy()
        draw = ImageDraw.Draw(image_source)

        text_bbox = draw.textbbox((0, 0), name, font=font)
        text_width, text_height = text_bbox[2] - text_bbox[0], text_bbox[3] - text_bbox[1]

        # Apply the user-defined vertical offset
        draw.text(((width - text_width) / 2, (height - text_height) / 2 + vertical_offset), name, fill=FONT_COLOR, font=font)

        output_file = os.path.join(output_dir, name + ".png")
        image_source.save(output_file)
        print('Saving Certificate for:', name)


def preview_certificate(template_file, name, vertical_offset, font_size):
    font = ImageFont.truetype(FONT_NAME, font_size)
    name = str(name).upper()

    template = Image.open(template_file)
    width, height = template.size

    image_source = template.copy()
    draw = ImageDraw.Draw(image_source)

    text_bbox = draw.textbbox((0, 0), name, font=font)
    text_width, text_height = text_bbox[2] - text_bbox[0], text_bbox[3] - text_bbox[1]

    # Apply the user-defined vertical offset
    draw.text(((width - text_width) / 2, (height - text_height) / 2 + vertical_offset), name, fill=FONT_COLOR, font=font)

    return image_source
