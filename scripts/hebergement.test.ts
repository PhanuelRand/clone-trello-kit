import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Hono } from 'hono'
import { creerServeur } from '../src/hebergement'

test('API historique, alias /api et interface restent distincts', async () => {
  process.env.SERVE_WEB = '1'
  const api = new Hono()
  api.get('/health', (c) => c.json({ status: 'ok' }))
  api.post('/commandes', (c) => c.json({ creee: true }, 201))
  api.get('/interdit', (c) => c.json({ erreur: 'interdit' }, 403))
  const serveur = creerServeur(api)
  for (const chemin of ['/health', '/api/health']) {
    const reponse = await serveur.request(chemin)
    assert.equal(reponse.status, 200)
    assert.deepEqual(await reponse.json(), { status: 'ok' })
  }
  for (const chemin of ['/commandes', '/api/commandes']) {
    assert.equal((await serveur.request(chemin, { method: 'POST' })).status, 201)
  }
  assert.equal((await serveur.request('/api/interdit')).status, 403)
  for (const chemin of ['/', '/tableaux/exemple']) {
    const reponse = await serveur.request(chemin, { headers: { accept: 'text/html' } })
    assert.equal(reponse.status, 200)
    assert.match(reponse.headers.get('content-type') ?? '', /text\/html/)
    assert.match(await reponse.text(), /<div id="root">/)
  }
  const html = readFileSync(new URL('../web/dist/index.html', import.meta.url), 'utf8')
  const ressource = html.match(/src="([^"]+\.js)"/)?.[1]
  assert.ok(ressource, 'le frontend compilé référence son JavaScript')
  const js = await serveur.request(ressource)
  assert.equal(js.status, 200)
  assert.match(js.headers.get('content-type') ?? '', /javascript/)
  for (const chemin of ['/api', '/api/inconnue', '/assets/inconnu.js', '/.env']) {
    const reponse = await serveur.request(chemin, { headers: { accept: 'text/html' } })
    assert.equal(reponse.status, 404)
  }
  assert.equal(
    (await serveur.request('/inconnue', { headers: { accept: 'application/json' } }))
      .status,
    404,
  )
  assert.equal(
    (await serveur.request('/tableaux/exemple', { method: 'POST' })).status,
    404,
  )
})

test('le mode développement ne sert pas le frontend compilé', async () => {
  delete process.env.SERVE_WEB
  const serveur = creerServeur(new Hono())
  assert.equal(
    (await serveur.request('/', { headers: { accept: 'text/html' } })).status,
    404,
  )
})
