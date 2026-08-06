# CertiMaster (Legacy Python Version)

## Overview

**CertiMaster** is a versatile and user-friendly certificate generation tool designed to create professional-quality certificates efficiently. Whether you're organizing a workshop, conference, or academic event, CertiMaster simplifies the process of generating personalized certificates with custom fonts and templates.

> [!NOTE]
> This directory contains documentation for the legacy Python backend version of CertiMaster. The main project has since migrated to a 100% native web approach. For the modern web documentation, please see the [main README](../README.md).

## Features

- **Support for Multiple File Formats:** Generate certificates from names provided in `.txt`, `.csv`, or `.xlsx` files.
- **Customizable Templates:** Use your own image templates in `.png`, `.jpg`, or `.jpeg` formats.
- **Flexible Font and Design Options:** Adjust font size, color, and vertical positioning to fit your design needs.
- **Preview Feature:** Visualize certificates before final generation to ensure they meet your expectations.
- **Automatic Cleanup:** Temporary files are automatically deleted after processing.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/A-Akhil/CertiMaster.git
   cd CertiMaster
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  
   # On Windows, use venv\Scripts\activate
   ```

3. Install the required packages:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

### Start the Application:

```bash
streamlit run ui.py
```
**Upload Files:**
- Upload a .txt, .csv, or .xlsx file containing the names.
- Upload an image file for the certificate template.

**Customize Settings:**
- Enter the output directory.
- Adjust the vertical position and font size.
- Select a font from available system fonts.

**Generate Certificates:**
- Click the "Generate Certificates" button to start the creation process.
- View the preview and verify before finalizing.
