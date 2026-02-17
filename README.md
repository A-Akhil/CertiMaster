# CertiMaster: The Ultimate Certificate Generator

## Overview

**CertiMaster** is a versatile and user-friendly certificate generation tool designed to create professional-quality certificates efficiently. Whether you're organizing a workshop, conference, or academic event, CertiMaster simplifies the process of generating personalized certificates with custom fonts and templates.

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
Upload Files:

    Upload a .txt, .csv, or .xlsx file containing the names.
    Upload an image file for the certificate template.

Customize Settings:

    Enter the output directory.
    Adjust the vertical position and font size.
    Select a font from available system fonts.

Generate Certificates:

    Click the "Generate Certificates" button to start the creation process.
    View the preview and verify before finalizing.

## Web Client (New)

We now offer a fully client-side React version of CertiMaster! No installation required if deployed, or run it locally with Node.js.

### Features

- 100% Client-Side: No data leaves your browser.
- Blazing Fast: Generates certificates instantly.
- Multiple File Support: Upload .txt, .csv, .xlsx, or .xls files.
- Custom Templates: proper .png, .jpg, or .jpeg support.
- Drag-and-Drop Editor: Position names easily.
- Customization: Adjust font, size, color, and position.
- Batch Export: Download as ZIP.

### Running the Web Client

1. Navigate to the web directory:
   ```bash
   cd web
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open the URL shown in the terminal.

## Thanks to all Wonderful Contributors

Thanks a lot for spending your time helping this InternetAwareAI grow.
Thanks a lot! Keep rocking

[![Contributors](https://contrib.rocks/image?repo=A-Akhil/CertiMaster)](https://github.com/A-Akhil/CertiMaster/graphs/contributors)

<div align="center">

## Please support the development by donating.

[![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/aakhil)

</div>
