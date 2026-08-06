# CertiMaster

CertiMaster is a blazing fast, fully client-side web application for generating bulk certificates. Designed to handle massive batches (1000+ certificates) directly in your browser without any server-side processing, it leverages modern Web APIs to keep your data private and your system responsive.

## Features

- **100% Client-Side Processing**: No data ever leaves your browser. All image processing, PDF generation, and zip creation happens locally.
- **Blazing Fast Web Workers**: Utilizes a parallel worker pool via Web Workers and `OffscreenCanvas` to distribute rendering across your CPU cores, ensuring the main UI never freezes.
- **Native File System Streaming**: On supported browsers (Chrome, Edge), CertiMaster uses the File System Access API to stream generated files (PNG/PDF) directly to your local folder, completely eliminating Out-Of-Memory (OOM) crashes for massive batches.
- **Automated ZIP Fallback**: For browsers lacking the File System Access API (Firefox, Safari), CertiMaster intelligently falls back to generating chunked `.zip` batches to maintain memory stability.
- **Flexible Data Imports**: Copy/paste names, or import directly from `.txt` or `.csv` files.
- **Custom Fonts**: Dynamically search and load any Google Font to perfectly match your certificate's design.
- **Drag-and-Drop Editor**: Position names and adjustments easily.
- **QR Code Verification**: Optionally stamp each certificate with a unique QR code. These QR codes link back to your configured verification backend, ensuring the authenticity of the generated certificates.
- **Dual Export Modes**: Export as individual high-quality images (PNG) or scalable documents (PDF). PDF export includes an optimized "Single PDF" mode that merges all certificates into one contiguous document.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/A-Akhil/CertiMaster.git
   cd CertiMaster/web
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to the provided localhost URL (typically `http://localhost:5173`).

### Production Build

To build the application for production deployment (e.g., Cloudflare Pages):

```bash
npm run build
```
The optimized static assets will be output to the `dist/` directory.

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

If you are reading this from outside the repo or do not have the backend folder locally, use this direct setup guide link:
https://github.com/A-Akhil/CertiMaster/blob/main/verification-backend/SETUP.md

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

---

> [!NOTE]  
> **Legacy Python Version:** CertiMaster was originally built using Python for backend generation. We have since migrated to a 100% native web approach. If you are looking for the old Python documentation, please refer to the [legacy/README.md](legacy/README.md).
