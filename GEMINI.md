# Project: Universal Feature Phone Podcast Syncer
**Goal:** A web-app to sync podcasts to any USB Mass Storage device with strict filename control.

## Technical Stack
- **Frontend:** HTML5, CSS3, Vanilla JS.
- **Storage:** IndexedDB (to store subscription data & downloaded blobs).
- **Communication:** PostMessage API (Web App <-> Extension).

## Feature Phone Constraints (The "Guinea Pig" Profile: Nokia)
- **Path Length:** Max 255 characters.
- **Filename:** Clean alphanumeric + underscores only. No emojis/special chars.
- **Folder Structure:** Must sync to a top-level `/Podcasts` folder.
- **Audio:** Support `.mp3` only.

## Architecture
- **Web App:** Handles RSS parsing and file renaming logic.
- **Chrome Extension:** Uses `chrome.usb` to listen for device events and `chrome.fileSystem` (if in Chrome Apps) or coordinates with the Web App's File System Access API.

## Maintenance
- Keep code modular. Separate "Podcast Logic" from "File System Logic."

## Brand & Visual Identity: Retrofeed
**Vibe:** Premium Vintage / Hi-Fi Audio / 90s Industrial Design.

### Styleguide
- **Primary Color:** `#1A1A1B` (Obsidian/Charcoal)
- **Accent Color:** `#FFB400` (Amber/Vintage LED)
- **Secondary Accent:** `#707070` (Brushed Aluminum)
- **Typography:**
  - Headings: `VT323` (Google Font) for that CRT terminal look.
  - Body: `IBM Plex Mono` (Clean, engineering-focused).
- **UI Elements:**
  - Use "Inset" shadows for input fields (making them look like physical slots).
  - Borders should be thin and sharp.

### UI Logic
- **"The Cassette Spin":** When a file is downloading or syncing, show a subtle rotating reel animation.
- **Tone:** Technical and reliable. Avoid "cutesy" language.
