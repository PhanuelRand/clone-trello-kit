import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { fileURLToPath } from 'node:url'

/** Deux sources en développement, une seule origine pour la démonstration. */
export function creerServeur(api: Hono) {
  const serveur = new Hono()
  // Les routes historiques restent disponibles pour le contrat pédagogique.
  serveur.route('/api', api)
  serveur.route('/', api)
  serveur.all('/api', (c) => c.json({ erreur: 'Route inconnue' }, 404))
  serveur.all('/api/*', (c) => c.json({ erreur: 'Route inconnue' }, 404))

  if (process.env.SERVE_WEB === '1') {
    const racine = fileURLToPath(new URL('../web/dist/', import.meta.url))
    serveur.get('*', serveStatic({ root: racine }))
    // Une navigation React peut être rechargée directement. Une ressource
    // manquante ou un appel JSON ne doit jamais recevoir index.html par erreur.
    serveur.get('*', (c, suivant) => {
      if (
        c.req.header('accept')?.includes('text/html') &&
        !c.req.path.split('/').pop()?.includes('.')
      ) {
        return serveStatic({ root: racine, path: 'index.html' })(c, suivant)
      }
      return suivant()
    })
  }
  return serveur
}
