# CertiMaster Verification Backend

This directory contains the Cloudflare Worker backend that powers the **QR Code Verification System** for CertiMaster.

## Overview

When the verification feature is enabled in the web client, it generates unique UUIDs for every certificate and embeds a QR code that links to this backend. 

This Cloudflare Worker handles:
1. **Batch Saving**: The web client sends the UUIDs, names, and event data here to be saved in a Cloudflare D1 SQL database.
2. **Verification Page**: When a user scans the QR code, this worker serves the `verify-valid.html` or `verify-invalid.html` page based on whether the UUID exists in the D1 database.
3. **Admin Panel**: Provides a simple, password-protected dashboard to manage and view all issued certificates.

## Setup Instructions

For a full step-by-step setup guide on how to configure your Cloudflare account, initialize the D1 database, and set up your secrets, please read the [SETUP.md](SETUP.md) file.

## Quick Commands

If you have already set up your database and secrets:

- **Deploy Changes**: `npx wrangler deploy`
- **Tail Logs**: `npx wrangler tail`
- **Local Dev Server**: `npx wrangler dev`

## Customization

You can fully customize the appearance of the verification pages by editing the HTML files in the `src/` directory.

- `src/verify-valid.html`
- `src/verify-invalid.html`

Use placeholders like `{{NAME}}`, `{{EVENT}}`, and `{{DATE}}` which will be dynamically replaced by the worker at runtime. Remember to run `npx wrangler deploy` after making changes.
