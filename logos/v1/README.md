# LanguageRecap brand files

Concept: a speech bubble (the lesson) holding dots whose gaps grow wider (the expanding review intervals). The last dot is amber: the next recall.

Colors: gradient #2E2A94 -> #5B4CF0, ink #1E1B4B, amber #FFB020.
Wordmark is converted to outlines (Poppins Bold, SIL OFL), so it needs no font.

## Next.js (app router) placement
- app/icon.svg               <- icon.svg
- app/favicon.ico            <- favicon.ico
- app/apple-icon.png         <- apple-icon.png
- public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png
- app/manifest.webmanifest   <- manifest.webmanifest (edit start_url / names)

Next.js picks up icon.svg, favicon.ico and apple-icon.png from app/ automatically.
For the theme color, add to app/layout.tsx:
  export const viewport = { themeColor: '#2E2A94' };

## Use
- logo-mark.svg: square mark for avatars, login page, headers.
- logo-horizontal.svg: on light backgrounds.
- logo-horizontal-light.svg: on dark backgrounds.
- icon.svg / favicon.ico: 3-dot variant, tuned for 16-32 px.
