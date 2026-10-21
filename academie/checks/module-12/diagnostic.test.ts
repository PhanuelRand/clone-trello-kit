/**
 * Module 12 : Diagnostic, les écritures simultanées.
 *
 * Aux modules 6, 8 et 9, vos cartes, vos déplacements et vos invitations ont
 * passé toutes leurs vérifications. Elles envoyaient les demandes une par une.
 * Celles-ci les envoient en même temps.
 *
 * Une implémentation qui lit puis écrit laisse une fenêtre entre les deux :
 *
 * - deux membres qui glissent la même carte au même instant, chacun depuis son
 *   écran, voient les deux demandes lire « version 1 », et les deux
 *   déplacements passent : le second écrase le premier sans le savoir;
 * - huit cartes ajoutées d'un coup en bas d'une liste lisent toutes la même
 *   dernière position, et prennent la même place;
 * - six personnes qui acceptent leur invitation au même instant, sur un
 *   tableau qui n'a plus que trois places, lisent toutes « il reste de la
 *   place », et le tableau dépasse dix membres;
 * - la même invitation acceptée cinq fois, par un double clic ou un réseau qui
 *   réessaie, se heurte à la clé du couple (tableau, membre) : sans
 *   précaution, la base refuse le doublon par une erreur que personne ne
 *   traduit.
 *
 * Aucun test séquentiel ne voit ces défauts. La garantie doit venir de la base :
 * une mise à jour conditionnelle de la version, un verrou sur la liste ou sur
 * le tableau pendant la transaction, et un refus de la base traduit en réponse
 * lisible.
 *
 * Contrat attendu, exporté par `src/academie/module-12.ts` : les fonctions des
 * modules 6, 7, 8 et 9, que vous réexportez.
 *
 *   export function createMember(input?: { name?: string; email?: string }): Promise<string>
 *   export function setupBoard(input?: { ... })                        // module 7
 *   export function addCard(input: { ... })                            // module 7
 *   export function createCard(input: { listId; memberId; title })     // module 6
 *   export function listCards(input: { listId; memberId })             // module 8
 *   export function moveCard(input: { cardId; memberId; toListId; index; expectedVersion })   // module 8
 *   export function invite(input: { boardId; inviterId; email; role; now })                   // module 9
 *   export function acceptInvitation(input: { token; memberId; now })  // module 9
 *   export function boardMembers(input: { boardId; memberId })         // module 9
 *   export function seatsLeft(input: { boardId; now })                 // module 9
 */
import { describe, expect, it } from 'vitest'
import {
  acceptInvitation,
  addCard,
  boardMembers,
  createCard,
  createMember,
  invite,
  listCards,
  moveCard,
  seatsLeft,
  setupBoard,
} from '../../../src/academie/module-12'

const now = '2030-07-10T06:00:00.000Z'

function uniqueEmail() {
  return `invite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.org`
}

async function guest(boardId: string, inviterId: string) {
  const email = uniqueEmail()
  const memberId = await createMember({ email })
  const sent = await invite({ boardId, inviterId, email, role: 'MEMBER', now })
  if (!sent.token) throw new Error(`invitation refusée : ${sent.reason ?? sent.status}`)
  return { memberId, token: sent.token }
}

describe('demandes simultanées', { timeout: 60_000 }, () => {
  // Le test que seule une garantie de la base fait passer de façon fiable.
  it('n’accepte qu’un déplacement quand deux membres glissent la même carte au même instant', async () => {
    const setups = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const board = await setupBoard()
        const cardId = await addCard({ listId: board.listIds[0] ?? '', title: 'Disputée' })
        return { ...board, cardId }
      }),
    )

    const responses = await Promise.all(
      setups.flatMap(({ ownerId, listIds, cardId }) =>
        [listIds[1] ?? '', listIds[2] ?? ''].map((toListId) =>
          moveCard({ cardId, memberId: ownerId, toListId, index: 0, expectedVersion: 1 }),
        ),
      ),
    )

    expect(
      responses.filter((response) => response.status === 200),
      'un déplacement réussi par carte, pas deux',
    ).toHaveLength(setups.length)
    for (const { ownerId, listIds, cardId } of setups) {
      const places = []
      for (const listId of listIds) {
        const found = (await listCards({ listId, memberId: ownerId })).find((card) => card.cardId === cardId)
        if (found) places.push(found)
      }
      expect(places, 'la carte est dans une seule liste').toHaveLength(1)
      expect(places[0]?.version, 'la version n’a avancé qu’une fois').toBe(2)
    }
  })

  it('donne une place distincte à huit cartes ajoutées en même temps en bas d’une liste', async () => {
    const board = await setupBoard()
    const listId = board.listIds[0] ?? ''
    await addCard({ listId, title: 'Déjà là' })

    const results = await Promise.all(
      Array.from({ length: 8 }, (_unused, index) =>
        createCard({ listId, memberId: board.ownerId, title: `Ajoutée ${index + 1}` }),
      ),
    )
    expect(results.filter((result) => result.status === 201)).toHaveLength(8)

    const cards = await listCards({ listId, memberId: board.ownerId })
    expect(cards).toHaveLength(9)
    expect(new Set(cards.map((card) => card.position)).size, 'aucune position partagée').toBe(9)
    expect(cards[0]?.title, 'les nouvelles cartes vont en bas').toBe('Déjà là')
  })

  it('ne laisse entrer que trois personnes sur six quand il reste trois places', async () => {
    const members = []
    for (let index = 0; index < 6; index += 1) members.push({ memberId: await createMember(), role: 'MEMBER' as const })
    const { boardId, ownerId } = await setupBoard({ members })
    const guests = []
    for (let index = 0; index < 6; index += 1) guests.push(await guest(boardId, ownerId))

    const results = await Promise.all(guests.map(({ token, memberId }) => acceptInvitation({ token, memberId, now })))

    expect(results.filter((result) => result.status === 200), 'dix membres au plus').toHaveLength(3)
    expect(results.filter((result) => result.status === 409)).toHaveLength(3)
    expect(await seatsLeft({ boardId, now })).toBe(0)
    expect((await boardMembers({ boardId, memberId: ownerId })).items).toHaveLength(10)
  })

  it('ne fait entrer qu’une fois une invitation acceptée cinq fois en même temps', async () => {
    const { boardId, ownerId } = await setupBoard()
    const { token, memberId } = await guest(boardId, ownerId)

    const results = await Promise.all(Array.from({ length: 5 }, () => acceptInvitation({ token, memberId, now })))

    expect(results.filter((result) => result.status === 200)).toHaveLength(1)
    expect(results.filter((result) => result.status === 409), 'les autres reçoivent 409, jamais une erreur').toHaveLength(4)
    const entries = (await boardMembers({ boardId, memberId: ownerId })).items.filter((item) => item.memberId === memberId)
    expect(entries).toHaveLength(1)
  })
})
