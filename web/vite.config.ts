import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  // Construite, l'interface est servie par le serveur sur la même adresse : elle
  // appelle /api. Une valeur VITE_ADRESSE_API définie dans le terminal garde la main.
  define:
    command === 'build'
      ? {
          'import.meta.env.VITE_ADRESSE_API': JSON.stringify(
            process.env.VITE_ADRESSE_API ?? '/api',
          ),
        }
      : {},
  resolve: {
    // `@` désigne `web/src`. C'est l'alias que shadcn emploie quand il ajoute
    // un composant : sans lui, `npx shadcn add` écrit des imports qui ne
    // résolvent pas.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000', ws: true },
    },
    // Ouvre le serveur aux autres appareils du réseau, pour regarder vos écrans
    // depuis un téléphone pendant que vous développez.
    host: true,
  },
}))
