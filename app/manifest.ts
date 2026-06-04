import type { MetadataRoute } from 'next'

// Web app manifest — makes GangaLoo installable to a phone's home screen.
// Next.js serves this at /manifest.webmanifest and links it automatically;
// no change to layout is needed. The home-screen ICON comes from the existing
// app/icon.png + app/apple-icon.png (already auto-wired by Next.js); this file
// adds the Android "Install app" capability, the app name, and full-screen mode.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GangaLoo',
    short_name: 'GangaLoo',
    description: 'Tienda GangaLoo — extensiones y pelucas de cabello.',
    lang: 'es',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0A2A66',
    theme_color: '#0A2A66',
    icons: [
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
