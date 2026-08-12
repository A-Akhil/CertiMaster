# CertiMaster Web Client

This directory contains the modern, client-side React application for CertiMaster. It is built with React, Vite, and Tailwind CSS.

> [!NOTE]
> For a high-level overview of the entire project's features and architecture, please see the [Root README](../README.md).

## Development

The web client is designed to run entirely in the browser using Web Workers and the File System Access API. 

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start Dev Server**:
   ```bash
   npm run dev
   ```
   This will start the Vite development server with Hot Module Replacement (HMR).

3. **Build for Production**:
   ```bash
   npm run build
   ```
   This compiles the React code and produces optimized static assets in the `dist/` folder, ready to be deployed to any static host (like Cloudflare Pages).

## Project Structure

- `src/App.tsx`: Main application entry point and UI layout. Handles state management, UI rendering, and coordinating Web Workers.
- `src/workers/certificateWorker.ts`: The Web Worker script that uses `OffscreenCanvas` to process images and generate certificates in parallel without blocking the main thread.
- `src/components/ui/`: Reusable Radix UI and Tailwind CSS components (buttons, sliders, dialogs, etc.).
- `src/lib/utils.ts`: Helper functions and utilities.
- `public/`: Static assets (fonts, default templates) that are served directly.

## Testing QR Verification

If you are developing the QR verification feature, you will need the backend running or deployed.
For instructions on setting up the Cloudflare Worker backend, please see the [Verification Backend Setup Guide](../verification-backend/SETUP.md).
