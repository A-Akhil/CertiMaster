# CertiMaster
# Copyright (C) 2023 - 2026  A-Akhil
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.

import os
from PIL import Image, ImageFont, ImageDraw
from concurrent.futures import ThreadPoolExecutor, as_completed
import matplotlib.font_manager as fm  # For cross-platform font management

FONT_COLOR = "#000000"

def generate_certificate_for_name(name, template_file, output_dir, vertical_offset, horizontal_offset, font_size, font_path):
    name = str(name).upper()  # Change all names to capital letters

    template = Image.open(template_file)
    width, height = template.size

    image_source = template.copy()
    draw = ImageDraw.Draw(image_source)

    font = ImageFont.truetype(font_path, font_size)
    text_bbox = draw.textbbox((0, 0), name, font=font)
    text_width, text_height = text_bbox[2] - text_bbox[0], text_bbox[3] - text_bbox[1]

    # Apply the user-defined vertical and horizontal offsets
    draw.text(((width - text_width) / 2 + horizontal_offset, (height - text_height) / 2 + vertical_offset), name,
              fill=FONT_COLOR, font=font)

    output_file = os.path.join(output_dir, f"{name}.png")

    try:
        image_source.save(output_file)
        print('Saving Certificate for:', name)
    except Exception as e:
        print(f"Error saving {output_file}: {e}")

def make_certificates(df, name_column, template_file, output_dir, vertical_offset, horizontal_offset, font_size, font_path):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    names = df[name_column].tolist()

    # Dynamic thread allocation based on the number of available CPUs
    num_threads = os.cpu_count() or 1  # Defaults to 1 if os.cpu_count() returns None
    print("num_threads", num_threads)

    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = [executor.submit(generate_certificate_for_name, name, template_file, output_dir, vertical_offset, horizontal_offset, font_size, font_path) for name in names]

        for future in as_completed(futures):
            future.result()  # To capture exceptions, if any

    # Delete the temporary file if it exists
    if os.path.exists(template_file):
        os.remove(template_file)
        print(f"Deleted template file: {template_file}")
    else:
        print(f"Template file already deleted or not found: {template_file}")

def preview_certificate(template_file, name, vertical_offset, horizontal_offset, font_size, font_path):
    template = Image.open(template_file)
    width, height = template.size

    image_source = template.copy()
    draw = ImageDraw.Draw(image_source)

    font = ImageFont.truetype(font_path, font_size)
    text_bbox = draw.textbbox((0, 0), name, font=font)
    text_width, text_height = text_bbox[2] - text_bbox[0], text_bbox[3] - text_bbox[1]

    # Apply the user-defined vertical and horizontal offsets
    draw.text(((width - text_width) / 2 + horizontal_offset, (height - text_height) / 2 + vertical_offset), name,
              fill=FONT_COLOR, font=font)

    return image_source
