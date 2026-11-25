# Customer Pulse frontend

Static frontend for GitHub Pages. The API is hosted separately on Render.

Enable GitHub Pages in Settings → Pages, publishing from the main branch and root folder.

The site prompts for your dashboard username and password. Credentials are sent only to the configured HTTPS API and kept in memory for the current page. They are never included in this repository or saved to browser storage. Sign out reloads the page and clears the in-memory login and displayed metrics.

This repository contains UI code, customer labels and demo content. It contains no backend code, Google Sheet configuration, credentials, source records or published metric snapshots. Live metrics require API authentication. GitHub Pages itself is public.
