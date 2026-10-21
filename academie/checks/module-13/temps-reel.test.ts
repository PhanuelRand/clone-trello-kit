/**
 * Module 13 : Le tableau en temps réel, les commentaires et le journal.
 *
 * Deux membres ont le même tableau ouvert. Quand l'un déplace une carte ou
 * écrit un commentaire, l'autre le voit sans recharger la page. Chaque carte
 * garde un journal de ce qui lui est arrivé, et un membre qu'on affecte à une
 * carte reçoit une notification. Trois règles font la différence entre un
 * tableau partagé et une fuite de données :
 *
 * - seuls les membres du tableau lisent ses commentaires, son journal et ses
 *   événements, et le serveur le vérifie à chaque lecture, à chaque envoi et à
 *   chaque abonnement;
 * - un membre retiré du tableau cesse aussitôt de recevoir ses événements;
 * - le contenu d'un commentaire n'apparaît jamais dans les journaux du serveur.
 *
 * Contrat attendu, exporté par `src/academie/module-13.ts` :
 *
 *   export function createMember(input?: { name?: string }): Promise<string>
 *   export function setupBoard(input?: { ... })                        // module 7
 *   export function createCard(input: { listId; memberId; title })     // module 6
 *   export function updateCard(input: { cardId; memberId; ... })       // module 6
 *   export function listCards(input: { listId; memberId })             // module 8
 *   export function moveCard(input: { cardId; memberId; toListId; index; expectedVersion })   // module 8
 *   export function removeMember(input: { boardId; memberId; targetId })                      // module 9
 *
 *   export function addComment(input: {
 *     cardId: string; authorId: string; body: string
 *   }): Promise<{ status: number; commentId?: string }>   // 201; 400 vide ou plus de 2 000
 *                                                          // caractères; 404 non-membre
 *   export function listComments(input: { cardId: string; memberId: string }): Promise<{
 *     status: number                                       // 200; 404 non-membre
 *     items: { commentId: string; authorId: string | null; authorName: string; body: string }[]
 *   }>                                                     // les plus anciens d'abord
 *   export function editComment(input: { commentId: string; memberId: string; body: string }):
 *     Promise<{ status: number }>                          // 200 pour l'auteur; 400; 403; 404
 *   export function deleteComment(input: { commentId: string; memberId: string }):
 *     Promise<{ status: number }>                          // 200 pour l'auteur ou un
 *                                                          // administrateur; 403; 404
 *
 *   export function activity(input: { cardId: string; memberId: string }): Promise<{
 *     status: number                                       // 200; 404 non-membre
 *     items: { activityId: string; kind: ActivityKind; actorId: string | null }[]
 *   }>                                                     // les plus anciens d'abord
 *   type ActivityKind =
 *     'CARD_CREATED' | 'CARD_UPDATED' | 'CARD_MOVED' | 'CARD_COMPLETED' | 'COMMENT_ADDED'
 *                                                      // CARD_COMPLETED : passée à DONE;
 *                                                      // actorId null : une automatisation (module 16)
 *
 *   export function subscribe(input: {
 *     boardId: string; memberId: string
 *     onEvent: (event: { type: ActivityKind; cardId: string }) => void
 *   }): Promise<{ status: number; unsubscribe: () => void }>   // 200; 404 non-membre
 *
 *   export function unreadCount(memberId: string): Promise<number>
 *   export function markAllRead(memberId: string): Promise<void>
 *
 * Un observateur commente : c'est son droit (module 4). Un abonnement refusé
 * rend quand même une fonction `unsubscribe`, qui ne fait rien. Affecter un
 * membre à une carte lui envoie une notification `ASSIGNED`, sauf s'il
 * s'affecte lui-même ou s'il était déjà affecté; `unreadCount` compte toutes
 * ses notifications non lues, rappels du module 10 compris.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  activity,
  addComment,
  createCard,
  createMember,
  deleteComment,
  editComment,
  listCards,
  listComments,
  markAllRead,
  moveCard,
  removeMember,
  setupBoard,
  subscribe,
  unreadCount,
  updateCard,
} from '../../../src/academie/module-13'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

/** Un administrateur, un membre, un observateur, et une carte créée par l'administrateur. */
async function team() {
  const adminId = await createMember({ name: 'Mialy' })
  const colleagueId = await createMember({ name: 'Tojo' })
  const observerId = await createMember({ name: 'Fara' })
  const { boardId, listIds } = await setupBoard({
    ownerId: adminId,
    members: [
      { memberId: colleagueId, role: 'MEMBER' },
      { memberId: observerId, role: 'OBSERVER' },
    ],
  })
  const created = await createCard({ listId: listIds[0] ?? '', memberId: adminId, title: 'Réserver la salle' })
  if (!created.cardId) throw new Error(`carte refusée : ${created.status}`)
  return { adminId, colleagueId, observerId, boardId, listIds, cardId: created.cardId }
}

async function versionOf(listId: string, memberId: string, cardId: string) {
  return (await listCards({ listId, memberId })).find((card) => card.cardId === cardId)?.version ?? 0
}

/** Les événements reçus par un membre, rangés au fur et à mesure. */
async function listen(boardId: string, memberId: string) {
  const received: { type: string; cardId: string }[] = []
  const subscription = await subscribe({ boardId, memberId, onEvent: (event) => received.push(event) })
  cleanups.push(subscription.unsubscribe)
  return { received, status: subscription.status }
}

function pause(milliseconds: number) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))
}

/** Attend qu'une condition devienne vraie, ou échoue au bout de trois secondes. */
async function eventually(condition: () => boolean, message: string) {
  for (let waited = 0; waited < 3_000; waited += 50) {
    if (condition()) return
    await pause(50)
  }
  throw new Error(message)
}

describe('les commentaires', () => {
  it('rend les commentaires à tous les membres, dans l’ordre, observateur compris', async () => {
    const { adminId, colleagueId, observerId, cardId } = await team()
    expect((await addComment({ cardId, authorId: colleagueId, body: 'J’ai appelé la mairie.' })).status).toBe(201)
    expect((await addComment({ cardId, authorId: observerId, body: 'Pensez au parking.' })).status).toBe(201)

    for (const memberId of [adminId, colleagueId, observerId]) {
      const result = await listComments({ cardId, memberId })
      expect(result.status).toBe(200)
      expect(result.items.map((item) => item.body)).toEqual(['J’ai appelé la mairie.', 'Pensez au parking.'])
      expect(result.items.map((item) => item.authorName)).toEqual(['Tojo', 'Fara'])
    }
  })

  it('refuse un commentaire vide ou trop long avec 400, et un non-membre avec 404', async () => {
    const { adminId, cardId } = await team()
    const stranger = await createMember()
    expect((await addComment({ cardId, authorId: adminId, body: '   ' })).status).toBe(400)
    expect((await addComment({ cardId, authorId: adminId, body: 'a'.repeat(2_001) })).status).toBe(400)
    expect((await addComment({ cardId, authorId: stranger, body: 'Intrus' })).status).toBe(404)

    const read = await listComments({ cardId, memberId: stranger })
    expect(read.status).toBe(404)
    expect(read.items).toEqual([])
  })

  it('laisse l’auteur modifier son commentaire, et le refuse aux autres avec 403', async () => {
    const { adminId, colleagueId, cardId } = await team()
    const { commentId = '' } = await addComment({ cardId, authorId: colleagueId, body: 'Salle réservée.' })

    expect((await editComment({ commentId, memberId: colleagueId, body: 'Salle réservée pour samedi.' })).status).toBe(200)
    expect((await editComment({ commentId, memberId: adminId, body: 'Modifié par un autre' })).status).toBe(403)
    expect((await listComments({ cardId, memberId: adminId })).items[0]?.body).toBe('Salle réservée pour samedi.')
  })

  it('laisse l’auteur ou un administrateur supprimer un commentaire, pas un autre membre', async () => {
    const { adminId, colleagueId, observerId, cardId } = await team()
    const first = await addComment({ cardId, authorId: observerId, body: 'Premier' })
    const second = await addComment({ cardId, authorId: observerId, body: 'Second' })

    expect((await deleteComment({ commentId: first.commentId ?? '', memberId: colleagueId })).status).toBe(403)
    expect((await deleteComment({ commentId: first.commentId ?? '', memberId: adminId })).status).toBe(200)
    expect((await deleteComment({ commentId: second.commentId ?? '', memberId: observerId })).status).toBe(200)
    expect((await listComments({ cardId, memberId: adminId })).items).toEqual([])
  })
})

describe('le journal d’une carte', () => {
  it('garde la création, la modification, le déplacement et les commentaires, dans l’ordre', async () => {
    const { adminId, colleagueId, listIds, cardId } = await team()
    await updateCard({ cardId, memberId: colleagueId, description: 'Salle de 150 places.' })
    await moveCard({
      cardId,
      memberId: colleagueId,
      toListId: listIds[1] ?? '',
      index: 0,
      expectedVersion: await versionOf(listIds[0] ?? '', colleagueId, cardId),
    })
    await addComment({ cardId, authorId: adminId, body: 'Merci !' })

    const result = await activity({ cardId, memberId: adminId })
    expect(result.status).toBe(200)
    expect(result.items.map((item) => [item.kind, item.actorId])).toEqual([
      ['CARD_CREATED', adminId],
      ['CARD_UPDATED', colleagueId],
      ['CARD_MOVED', colleagueId],
      ['COMMENT_ADDED', adminId],
    ])
    expect(new Set(result.items.map((item) => item.activityId)).size, 'chaque entrée a son identifiant').toBe(4)
  })

  it('refuse le journal à un non-membre, avec 404', async () => {
    const { cardId } = await team()
    const result = await activity({ cardId, memberId: await createMember() })
    expect(result.status).toBe(404)
    expect(result.items).toEqual([])
  })
})

describe('en temps réel', () => {
  it('prévient les autres membres d’un déplacement et d’un commentaire, dès qu’ils arrivent', async () => {
    const { adminId, colleagueId, observerId, boardId, listIds, cardId } = await team()
    const colleague = await listen(boardId, colleagueId)
    const observer = await listen(boardId, observerId)
    expect(colleague.status).toBe(200)
    await pause(100)

    await moveCard({ cardId, memberId: adminId, toListId: listIds[1] ?? '', index: 0, expectedVersion: 1 })
    await addComment({ cardId, authorId: adminId, body: 'C’est parti.' })

    for (const { received } of [colleague, observer]) {
      await eventually(() => received.length >= 2, 'aucun événement reçu en 3 s')
      expect(received).toEqual([
        { type: 'CARD_MOVED', cardId },
        { type: 'COMMENT_ADDED', cardId },
      ])
    }
  })

  it('refuse l’abonnement à un non-membre, avec 404', async () => {
    const { boardId } = await team()
    const subscription = await subscribe({ boardId, memberId: await createMember(), onEvent: () => undefined })
    cleanups.push(subscription.unsubscribe)
    expect(subscription.status).toBe(404)
  })

  // Un membre retiré ne doit plus rien apprendre du tableau.
  it('cesse de prévenir un membre retiré du tableau, et lui refuse un nouvel abonnement', async () => {
    const { adminId, colleagueId, boardId, listIds } = await team()
    const colleague = await listen(boardId, colleagueId)
    await pause(100)

    await removeMember({ boardId, memberId: adminId, targetId: colleagueId })
    await createCard({ listId: listIds[0] ?? '', memberId: adminId, title: 'Après son départ' })
    await pause(500)

    expect(colleague.received, 'aucun événement après le retrait').toEqual([])
    const again = await subscribe({ boardId, memberId: colleagueId, onEvent: () => undefined })
    cleanups.push(again.unsubscribe)
    expect(again.status).toBe(404)
  })
})

describe('les notifications d’affectation', () => {
  it('prévient un membre affecté par un autre, une seule fois', async () => {
    const { adminId, colleagueId, cardId } = await team()
    const before = await unreadCount(colleagueId)

    await updateCard({ cardId, memberId: adminId, assignees: [colleagueId] })
    expect(await unreadCount(colleagueId)).toBe(before + 1)

    await updateCard({ cardId, memberId: adminId, assignees: [colleagueId, adminId] })
    expect(await unreadCount(colleagueId), 'déjà affecté : pas de seconde notification').toBe(before + 1)
  })

  it('ne prévient pas un membre qui s’affecte lui-même', async () => {
    const { colleagueId, cardId } = await team()
    await updateCard({ cardId, memberId: colleagueId, assignees: [colleagueId] })
    expect(await unreadCount(colleagueId)).toBe(0)
  })

  it('remet le compteur à zéro quand le membre lit ses notifications', async () => {
    const { adminId, colleagueId, cardId } = await team()
    await updateCard({ cardId, memberId: adminId, assignees: [colleagueId] })
    await markAllRead(colleagueId)
    expect(await unreadCount(colleagueId)).toBe(0)
  })
})
