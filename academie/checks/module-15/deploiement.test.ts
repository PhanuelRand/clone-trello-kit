/**
 * Module 15 : Mise en production.
 *
 * Cette suite n'interroge pas votre code source : elle interroge **votre
 * application déployée**, à son adresse publique. C'est la preuve qu'elle
 * fonctionne vraiment, hors de votre machine.
 *
 * Elle ne crée rien et ne modifie rien : votre base de production ne reçoit
 * aucune donnée de vérification.
 *
 * Renseignez deux secrets dans les paramètres de votre dépôt GitHub (Settings,
 * puis Secrets and variables, puis Actions) :
 *
 *   DEPLOYMENT_URL   l'adresse de votre application, par exemple https://mon-clone.onrender.com
 *   INTERFACE_URL    la même adresse : votre interface y est servie, avec l'API
 *
 * Contrat HTTP exigé :
 *
 *   GET  /health                   -> 2xx
 *   GET  /boards                   -> 401 sans session : les tableaux sont privés
 *   POST /boards                   -> 401 sans session : créer un tableau demande d'être connecté
 *   POST /cards                    -> 401 sans session : créer une carte aussi
 *   GET  /invitations/<jeton>      -> 404 pour un jeton inconnu : l'aperçu d'une invitation
 *                                     est public, mais un jeton inventé n'ouvre rien
 *   Une requête mal formée         -> 4xx, jamais 5xx
 *
 * Un hébergeur gratuit endort l'application après quelques minutes sans
 * visite : la première requête peut prendre près d'une minute. La suite
 * l'attend.
 */
import { describe, expect, it } from 'vitest'

const apiUrl = (process.env.DEPLOYMENT_URL ?? '').replace(/\/$/, '')
const interfaceUrl = (process.env.INTERFACE_URL ?? '').replace(/\/$/, '')
const timeout = 90_000

function call(url: string, init: RequestInit = {}): Promise<Response> {
  if (!/^https?:\/\//.test(url)) {
    throw new Error('Adresse manquante : renseignez les secrets DEPLOYMENT_URL et INTERFACE_URL.')
  }
  return fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
    // Un déploiement endormi doit se réveiller, mais pas bloquer la suite.
    signal: AbortSignal.timeout(timeout),
  })
}

describe('l’API déployée', () => {
  it('a une adresse configurée, servie en HTTPS', () => {
    expect(apiUrl, 'renseignez le secret DEPLOYMENT_URL avec l’adresse de votre API').toMatch(
      /^https:\/\/.+/,
    )
  })

  it('répond sur son point de santé', { timeout }, async () => {
    const response = await call(`${apiUrl}/health`)
    expect(response.ok).toBe(true)
  })
})

describe('les routes protégées', () => {
  // Un tableau est privé : sans session, on ne voit même pas la liste.
  it('refuse la liste des tableaux sans session', { timeout }, async () => {
    const response = await call(`${apiUrl}/boards`)
    expect(response.status).toBe(401)
  })

  it('refuse de créer un tableau sans session', { timeout }, async () => {
    const response = await call(`${apiUrl}/boards`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Tableau anonyme' }),
    })
    expect(response.status).toBe(401)
  })

  it('refuse de créer une carte sans session', { timeout }, async () => {
    const response = await call(`${apiUrl}/cards`, {
      method: 'POST',
      body: JSON.stringify({ listId: 'une-liste', title: 'Carte anonyme' }),
    })
    expect(response.status).toBe(401)
  })
})

describe('l’aperçu d’une invitation', () => {
  it('répond 404 pour un jeton inventé', { timeout }, async () => {
    const response = await call(`${apiUrl}/invitations/jeton-invente-par-la-verification`)
    expect(response.status).toBe(404)
  })

  it('répond à une requête mal formée par une erreur 4xx, jamais 5xx', { timeout }, async () => {
    const malformed = await call(`${apiUrl}/boards`, { method: 'POST', body: '{ pas du json' })
    expect(malformed.status).toBeGreaterThanOrEqual(400)
    expect(malformed.status).toBeLessThan(500)

    const strange = await call(`${apiUrl}/invitations/%E2%9C%93%20et%20des%20espaces`)
    expect(strange.status).toBeLessThan(500)
  })
})

describe('l’interface déployée', () => {
  it('a une adresse configurée, servie en HTTPS', () => {
    expect(
      interfaceUrl,
      'renseignez le secret INTERFACE_URL avec l’adresse de votre interface',
    ).toMatch(/^https:\/\/.+/)
  })

  it('sert une page HTML', { timeout }, async () => {
    const response = await call(interfaceUrl, { headers: { Accept: 'text/html' } })
    expect(response.ok).toBe(true)
    expect(await response.text()).toMatch(/<html[\s>]/i)
  })
})
