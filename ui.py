import streamlit as st
import pandas as pd
from excel import make_certificates  # Make sure `excel.py` is in the same directory or adjust the import

st.title('Certificate Generator')

# Upload Excel file
uploaded_file = st.file_uploader("Choose an Excel file", type="xlsx")

# Upload template file
uploaded_template = st.file_uploader("Choose a template image", type=["png", "jpg", "jpeg"])

# Input for custom output directory
output_dir = st.text_input("Enter the output directory", "out")

if uploaded_file and uploaded_template:
    df = pd.read_excel(uploaded_file, sheet_name=None)
    sheet_names = df.keys()

    st.write("Sheet names:", sheet_names)

    selected_sheet = st.selectbox("Select a sheet", sheet_names)
    df = df[selected_sheet]

    columns = df.columns.tolist()
    st.write("Available columns:", columns)

    name_column = st.selectbox("Select the column with names", columns)

    if st.button("Generate Certificates"):
        if name_column and uploaded_template:
            with st.spinner("Generating certificates..."):
                # Save the uploaded template to a temporary file
                with open("temp_template.png", "wb") as f:
                    f.write(uploaded_template.read())

                # Call the function with the temporary template file and custom output directory
                make_certificates(df, name_column, "temp_template.png", output_dir)

                st.success("Certificates generated successfully.")
        else:
            st.error("Please select a column and upload a template.")
else:
    st.info("Please upload both an Excel file and a template image.")
