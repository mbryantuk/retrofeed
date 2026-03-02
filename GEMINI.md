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
- **Web App:** Handles RSS parsing, file renaming logic, and device writing.
- **File System:** Uses the native Web File System Access API to write directly to the USB device. No Chrome Extension is required!

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
- **"Not on Device":** A dedicated dashboard indicator showing the number of cached episodes ready for sync.

## Key Features (v1.3.x)
- **Auto-Refresh on Load:** Automatically fetches latest episodes from all subscriptions upon application startup.
- **Auto-Sync to Device:** Triggers an automatic sync to the connected USB drive after feed updates or manual downloads.
- **Dual-Playlist Generation:**
  - `all_podcasts.m3u`: Global playlist in the root folder, sorted newest-first.
  - Per-Show Playlists: Individual show playlists inside each folder, sorted oldest-first.
- **Device-Based Configuration:** Full application state (settings + subscriptions) is mirrored to the USB device for instant restoration across different systems.
- **Folder Overrides:** Support for custom show titles (target directory names) that persist across refreshes and syncs.

## Task Management
Project tasks are tracked using a GitHub Project board (Kanban style). 
- **Board URL:** [https://github.com/users/mbryantuk/projects/1](https://github.com/users/mbryantuk/projects/1)
- Tasks are broken down into logical phases (e.g., Phase 1: Foundation & UI, Phase 2: Core Data Logic, etc.) and managed as draft issues or full repository issues.
