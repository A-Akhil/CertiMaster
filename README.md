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

## QR Verification System

The web client includes an optional QR code verification system. When enabled, each certificate gets a unique QR code printed on it. Scanning the QR opens a hosted verification page that confirms the certificate is genuine.

### How it works

1. Each certificate is assigned a UUID at generation time.
2. A QR code encoding `<server-url>/verify/<uuid>` is drawn onto the certificate canvas.
3. All records are batch-saved to a Cloudflare D1 database via the verification backend.
4. Anyone who scans the QR gets a verification page showing the recipient name, event, and issue date — or an "invalid" page if the ID does not exist.

### Setting up the backend

The verification backend just needs to be any server that exposes the required endpoints (`GET /health`, `POST /api/batch-save`, `GET /verify/:id`). The Cloudflare Worker in `verification-backend/` is the reference implementation, but you can use Express, FastAPI, Railway, or any other stack.

Full step-by-step setup instructions (including the required API contract) are in [verification-backend/SETUP.md](verification-backend/SETUP.md).

Quick summary:
```bash
# 1. Create the D1 database
npx wrangler d1 create certimaster-db

# 2. Paste the returned database_id into verification-backend/wrangler.toml

# 3. Run the schema migration
npx wrangler d1 execute certimaster-db --remote --file=verification-backend/schema.sql

# 4. Set your two keys
echo "your-api-key"   | npx wrangler secret put API_KEY
echo "your-admin-pwd" | npx wrangler secret put ADMIN_KEY

# 5. Deploy
cd verification-backend && npx wrangler deploy
```

### Customising the verify page

Edit `verification-backend/src/verify-valid.html` and `verify-invalid.html` directly. Use `{{NAME}}`, `{{EVENT}}`, `{{DATE}}`, `{{ID}}`, `{{ORG_NAME}}`, and `{{VERIFIED_ON}}` as placeholders — they are filled in at request time. Redeploy with `npx wrangler deploy` to apply changes.

### Updating the worker

Any change — whether to the HTML templates or to the worker logic in `src/index.js` — takes effect after redeploying:

```bash
cd verification-backend && npx wrangler deploy
```

Secrets and D1 data are preserved across deployments. Only the worker code changes.

### Admin panel

A password-protected admin panel is available at `<worker-url>/admin`. Log in with your `ADMIN_KEY` to view, search, filter, add, edit, and delete certificate records.

---

## Thanks to all Wonderful Contributors

Thanks a lot for spending your time helping this InternetAwareAI grow.
Thanks a lot! Keep rocking

[![Contributors](https://contrib.rocks/image?repo=A-Akhil/CertiMaster)](https://github.com/A-Akhil/CertiMaster/graphs/contributors)

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

You are free to use, modify, and distribute this software under the terms of the GPL v3. Any derivative work must also be distributed under the same license.

<div align="center">

## Please support the development by donating.

[![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/aakhil)

</div>
