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
import streamlit as st
import pandas as pd
import zipfile
import shutil
import matplotlib.font_manager as fm
from excel import make_certificates, preview_certificate
from text import make_certificates_txt

st.title('Certificate Generator')

# Upload file
uploaded_file = st.file_uploader("Choose a file", type=["xlsx", "csv", "txt"])

# Upload template file
uploaded_template = st.file_uploader("Choose a template image", type=["png", "jpg", "jpeg"])

# Input for custom output directory
save_option = st.radio("Choose how to save the certificates", ('Download as ZIP', 'Save in Folder(When Running locally)'))
if save_option == 'Save in Folder':
    output_dir = st.text_input("Enter the output directory", "out")
else:
    output_dir = "certificates_temp"  # Temporary folder for ZIP creation

# Input for vertical and horizontal offsets
vertical_offset = st.slider("Adjust the vertical position of the name", -200, 200, 0)
horizontal_offset = st.slider("Adjust the horizontal position of the name", -200, 200, 0)

# Input for font size
font_size = st.slider("Select the font size for the name", 20, 200, 80)

# Get all system fonts
fonts = fm.findSystemFonts(fontext='ttf')
font_names = {os.path.basename(font).split('.')[0]: font for font in fonts}
font_choice = st.selectbox("Select a font", list(font_names.keys()))

# Name for preview
preview_name = st.text_input("Enter a name to preview the certificate", "A Akhil")

if uploaded_template and preview_name:
    # Save the uploaded template to a temporary file
    with open("temp_template.png", "wb") as f:
        f.write(uploaded_template.read())

    # Display preview
    preview_image = preview_certificate("temp_template.png", preview_name, vertical_offset, horizontal_offset, font_size,
                                        font_names[font_choice])
    st.image(preview_image, caption="Certificate Preview", use_column_width=True)

def zip_folder(folder_path, output_path):
    shutil.make_archive(output_path, 'zip', folder_path)

if uploaded_file and uploaded_template:
    file_extension = uploaded_file.name.split('.')[-1]

    if file_extension in ['xlsx', 'xls']:
        # Load Excel file
        df = pd.read_excel(uploaded_file, sheet_name=None)
        sheet_names = df.keys()
        selected_sheet = st.selectbox("Select a sheet", sheet_names)
        df = df[selected_sheet]
        columns = df.columns.tolist()
        st.write("Available columns:", columns)
        name_column = st.selectbox("Select the column with names", columns)

        if st.button("Generate Certificates"):
            if name_column and uploaded_template:
                with st.spinner("Generating certificates..."):
                    make_certificates(df, name_column, "temp_template.png", output_dir, vertical_offset, horizontal_offset, font_size,
                                      font_names[font_choice])
                    st.success("Certificates generated successfully.")
                    if save_option == 'Download as ZIP':
                        zip_folder(output_dir, 'certificates')
                        with open('certificates.zip', 'rb') as f:
                            st.download_button('Download ZIP', f, file_name='certificates.zip')
                        shutil.rmtree(output_dir)  # Clean up temporary folder
                        if os.path.exists('certificates.zip'):
                            os.remove('certificates.zip')  # Delete the ZIP file after download
            else:
                st.error("Please select a column and upload a template.")

    elif file_extension == 'csv':
        # Load CSV file
        df = pd.read_csv(uploaded_file)
        columns = df.columns.tolist()
        st.write("Available columns:", columns)
        name_column = st.selectbox("Select the column with names", columns)

        if st.button("Generate Certificates"):
            if name_column and uploaded_template:
                with st.spinner("Generating certificates..."):
                    make_certificates(df, name_column, "temp_template.png", output_dir, vertical_offset, horizontal_offset, font_size,
                                      font_names[font_choice])
                    st.success("Certificates generated successfully.")
                    if save_option == 'Download as ZIP':
                        zip_folder(output_dir, 'certificates')
                        with open('certificates.zip', 'rb') as f:
                            st.download_button('Download ZIP', f, file_name='certificates.zip')
                        shutil.rmtree(output_dir)  # Clean up temporary folder
                        if os.path.exists('certificates.zip'):
                            os.remove('certificates.zip')  # Delete the ZIP file after download
            else:
                st.error("Please select a column and upload a template.")

    elif file_extension == 'txt':
        # Save the uploaded .txt file to a temporary location
        temp_txt_path = "temp_file.txt"
        with open(temp_txt_path, "wb") as f:
            f.write(uploaded_file.read())

        if st.button("Generate Certificates"):
            if uploaded_template:
                with st.spinner("Generating certificates..."):
                    make_certificates_txt(temp_txt_path, "temp_template.png", output_dir, vertical_offset, horizontal_offset, font_size,
                                          font_names[font_choice])
                    st.success("Certificates generated successfully.")
                    if save_option == 'Download as ZIP':
                        zip_folder(output_dir, 'certificates')
                        with open('certificates.zip', 'rb') as f:
                            st.download_button('Download ZIP', f, file_name='certificates.zip')
                        shutil.rmtree(output_dir)  # Clean up temporary folder
                        if os.path.exists('certificates.zip'):
                            os.remove('certificates.zip')  # Delete the ZIP file after download
            else:
                st.error("Please upload a template.")
else:
    st.info("Please upload both a file and a template image.")
