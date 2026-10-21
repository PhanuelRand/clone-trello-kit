/**
 * Module 16 : Les automatisations. Module Platine.
 *
 * Comme avec l'assistant d'automatisation de Trello, un administrateur écrit
 * des règles « quand… alors… » : quand une carte arrive dans « Terminé »,
 * alors la marquer terminée et écrire « Bravo ». Le tableau les applique tout
 * seul, après chaque création, déplacement ou fin de carte.
 *
 * Trois règles rendent les automatisations sûres :
 *
 * - une action faite par une automatisation ne déclenche aucune règle : deux
 *   règles qui se renvoient la carte ne tournent pas en boucle;
 * - une règle ne s'applique qu'une fois par événement, même quand l'événement
 *   est rejoué, par une reprise après une panne ou un double envoi : elle
 *   n'écrit pas deux fois « Bravo »;
 * - seul un administrateur écrit, modifie ou supprime une règle.
 *
 * Contrat attendu, exporté par `src/academie/module-16.ts` :
 *
 *   export type Trigger =
 *     | { type: 'CARD_ENTERS_LIST'; listId: string }   // créée dans la liste, ou glissée
 *                                                      // depuis une autre liste
 *     | { type: 'CARD_MARKED_DONE' }                   // passée à DONE
 *
 *   export type RuleAction =
 *     | { type: 'MARK_DONE' }
 *     | { type: 'MOVE_TO_LIST'; listId: string }       // en haut de la liste
 *     | { type: 'ASSIGN'; memberId: string }
 *     | { type: 'ADD_LABEL'; label: string }
 *     | { type: 'SET_DUE_IN_DAYS'; days: number }      // aujourd'hui à Madagascar, plus days
 *     | { type: 'ADD_COMMENT'; body: string }          // un commentaire sans auteur
 *
 *   export function actionsFor(input: {
 *     rules: { ruleId: string; trigger: Trigger; actions: RuleAction[] }[]
 *     event:
 *       | { type: 'CARD_ENTERED_LIST'; listId: string; byAutomation: boolean }
 *       | { type: 'CARD_MARKED_DONE'; byAutomation: boolean }
 *   }): { ruleId: string; action: RuleAction }[]       // dans l'ordre des règles, puis des actions
 *
 *   export function createMember(input?: { name?: string }): Promise<string>
 *   export function setupBoard(input?: { ... })                        // module 7
 *   export function createCard(input: { listId; memberId; title })     // module 6
 *   export function getCard(input: { cardId; memberId })               // module 6
 *   export function setCardStatus(input: { cardId; memberId; status }) // module 6
 *   export function listCards(input: { listId; memberId })             // module 8
 *   export function moveCard(input: { cardId; memberId; toListId; index; expectedVersion })   // module 8
 *   export function listComments(input: { cardId; memberId })          // module 13
 *   export function activity(input: { cardId; memberId })              // module 13
 *
 *   export function createRule(input: {
 *     boardId: string; memberId: string; trigger: Trigger; actions: RuleAction[]
 *   }): Promise<{ status: number; ruleId?: string; reason?: string }>
 *                                       // 201; 400 règle invalide; 403 sans être ADMIN; 404 non-membre
 *   export function listRules(input: { boardId: string; memberId: string }): Promise<{
 *     status: number; items: { ruleId: string; trigger: Trigger; actions: RuleAction[] }[]
 *   }>                                  // 200 pour tout membre; 404 non-membre
 *   export function deleteRule(input: { ruleId: string; memberId: string }): Promise<{ status: number }>
 *
 *   export function runAutomations(input: { activityId: string }): Promise<void>
 *                                       // applique les règles à une entrée du journal (module 13)
 *
 * Une règle est invalide quand elle n'a aucune action ou plus de cinq, nomme
 * une liste d'un autre tableau, affecte quelqu'un qui n'est pas membre, nomme
 * une étiquette inconnue (module 6), donne un nombre de jours qui n'est pas un
 * entier de 1 à 365, ou un commentaire vide.
 *
 * Votre serveur appelle `runAutomations` après chaque création, déplacement ou
 * fin de carte, avant de répondre. Terminer une carte s'écrit au journal sous
 * le genre `CARD_COMPLETED`. Les actions d'une automatisation s'écrivent au
 * journal sans auteur (`actorId: null`), et ne déclenchent aucune règle.
 */
import { describe, expect, it } from 'vitest'
import {
  actionsFor,
  activity,
  createCard,
  createMember,
  createRule,
  deleteRule,
  getCard,
  listCards,
  listComments,
  listRules,
  moveCard,
  runAutomations,
  setCardStatus,
  setupBoard,
} from '../../../src/academie/module-16'
import { shiftDays, todayInMadagascar } from '../_support/dates'

type Rule = Parameters<typeof actionsFor>[0]['rules'][number]

/** Un administrateur, un membre, un observateur, et le tableau qu'ils partagent. */
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
  const [todo = '', doing = '', done = ''] = listIds
  return { adminId, colleagueId, observerId, boardId, todo, doing, done }
}

async function rule(boardId: string, memberId: string, trigger: Rule['trigger'], actions: Rule['actions']) {
  const result = await createRule({ boardId, memberId, trigger, actions })
  if (!result.ruleId) throw new Error(`règle refusée : ${result.reason ?? result.status}`)
  return result.ruleId
}

async function card(listId: string, memberId: string, title = 'Carte à automatiser') {
  const result = await createCard({ listId, memberId, title })
  if (!result.cardId) throw new Error(`carte refusée : ${result.status}`)
  return result.cardId
}

async function versionOf(listId: string, memberId: string, cardId: string) {
  return (await listCards({ listId, memberId })).find((entry) => entry.cardId === cardId)?.version ?? 0
}

async function moveTo(cardId: string, memberId: string, fromListId: string, toListId: string, index = 0) {
  const expectedVersion = await versionOf(fromListId, memberId, cardId)
  const result = await moveCard({ cardId, memberId, toListId, index, expectedVersion })
  expect(result.status, 'le déplacement doit réussir').toBe(200)
}

async function commentBodies(cardId: string, memberId: string) {
  return (await listComments({ cardId, memberId })).items.map((item) => item.body)
}

describe('les règles qui s’appliquent', () => {
  const rules: Rule[] = [
    { ruleId: 'r1', trigger: { type: 'CARD_ENTERS_LIST', listId: 'termine' }, actions: [{ type: 'MARK_DONE' }, { type: 'ADD_COMMENT', body: 'Bravo' }] },
    { ruleId: 'r2', trigger: { type: 'CARD_ENTERS_LIST', listId: 'en-cours' }, actions: [{ type: 'ADD_LABEL', label: 'BLUE' }] },
    { ruleId: 'r3', trigger: { type: 'CARD_ENTERS_LIST', listId: 'termine' }, actions: [{ type: 'ADD_LABEL', label: 'GREEN' }] },
    { ruleId: 'r4', trigger: { type: 'CARD_MARKED_DONE' }, actions: [{ type: 'MOVE_TO_LIST', listId: 'termine' }] },
  ]

  it('applique les règles de la liste d’arrivée, dans l’ordre des règles puis des actions', () => {
    const result = actionsFor({ rules, event: { type: 'CARD_ENTERED_LIST', listId: 'termine', byAutomation: false } })
    expect(result).toEqual([
      { ruleId: 'r1', action: { type: 'MARK_DONE' } },
      { ruleId: 'r1', action: { type: 'ADD_COMMENT', body: 'Bravo' } },
      { ruleId: 'r3', action: { type: 'ADD_LABEL', label: 'GREEN' } },
    ])
  })

  it('applique les règles d’une carte terminée, et rien pour une liste sans règle', () => {
    expect(actionsFor({ rules, event: { type: 'CARD_MARKED_DONE', byAutomation: false } })).toEqual([
      { ruleId: 'r4', action: { type: 'MOVE_TO_LIST', listId: 'termine' } },
    ])
    expect(actionsFor({ rules, event: { type: 'CARD_ENTERED_LIST', listId: 'a-faire', byAutomation: false } })).toEqual([])
  })

  // Sans cette règle, deux automatisations peuvent se renvoyer une carte sans fin.
  it('n’applique rien à un événement produit par une automatisation', () => {
    expect(actionsFor({ rules, event: { type: 'CARD_ENTERED_LIST', listId: 'termine', byAutomation: true } })).toEqual([])
    expect(actionsFor({ rules, event: { type: 'CARD_MARKED_DONE', byAutomation: true } })).toEqual([])
  })
})

describe('écrire une règle', () => {
  it('laisse un administrateur écrire une règle, que tous les membres lisent', async () => {
    const { adminId, observerId, boardId, done } = await team()
    const created = await createRule({ boardId, memberId: adminId, trigger: { type: 'CARD_ENTERS_LIST', listId: done }, actions: [{ type: 'MARK_DONE' }] })
    expect(created.status).toBe(201)

    const listed = await listRules({ boardId, memberId: observerId })
    expect(listed.status).toBe(200)
    expect(listed.items).toEqual([
      { ruleId: created.ruleId, trigger: { type: 'CARD_ENTERS_LIST', listId: done }, actions: [{ type: 'MARK_DONE' }] },
    ])
  })

  it('refuse d’écrire une règle à un membre avec 403, et à un non-membre avec 404', async () => {
    const { colleagueId, boardId, done } = await team()
    const trigger = { type: 'CARD_ENTERS_LIST' as const, listId: done }
    expect((await createRule({ boardId, memberId: colleagueId, trigger, actions: [{ type: 'MARK_DONE' }] })).status).toBe(403)
    expect((await createRule({ boardId, memberId: await createMember(), trigger, actions: [{ type: 'MARK_DONE' }] })).status).toBe(404)
    expect((await listRules({ boardId, memberId: await createMember() })).status).toBe(404)
  })

  it('refuse une règle invalide, avec 400', async () => {
    const { adminId, boardId, done } = await team()
    const other = await setupBoard({ ownerId: adminId })
    const stranger = await createMember()
    const trigger = { type: 'CARD_ENTERS_LIST' as const, listId: done }
    const invalid: { label: string; trigger: Rule['trigger']; actions: Rule['actions'] }[] = [
      { label: 'aucune action', trigger, actions: [] },
      { label: 'six actions', trigger, actions: Array.from({ length: 6 }, () => ({ type: 'MARK_DONE' as const })) },
      { label: 'une liste d’un autre tableau', trigger: { type: 'CARD_ENTERS_LIST', listId: other.listIds[0] ?? '' }, actions: [{ type: 'MARK_DONE' }] },
      { label: 'un non-membre affecté', trigger, actions: [{ type: 'ASSIGN', memberId: stranger }] },
      { label: 'une étiquette inconnue', trigger, actions: [{ type: 'ADD_LABEL', label: 'ROSE' }] },
      { label: 'zéro jour', trigger, actions: [{ type: 'SET_DUE_IN_DAYS', days: 0 }] },
      { label: 'un jour et demi', trigger, actions: [{ type: 'SET_DUE_IN_DAYS', days: 1.5 }] },
      { label: 'un commentaire vide', trigger, actions: [{ type: 'ADD_COMMENT', body: '  ' }] },
    ]
    for (const entry of invalid) {
      const result = await createRule({ boardId, memberId: adminId, trigger: entry.trigger, actions: entry.actions })
      expect(result.status, entry.label).toBe(400)
    }
    expect((await listRules({ boardId, memberId: adminId })).items).toEqual([])
  })
})

describe('le tableau applique les règles', () => {
  it('termine une carte glissée dans « Terminé », et la félicite une fois', async () => {
    const { adminId, colleagueId, boardId, todo, done } = await team()
    await rule(boardId, adminId, { type: 'CARD_ENTERS_LIST', listId: done }, [
      { type: 'MARK_DONE' },
      { type: 'ADD_COMMENT', body: 'Bravo !' },
    ])
    const cardId = await card(todo, colleagueId)

    await moveTo(cardId, colleagueId, todo, done)
    expect((await getCard({ cardId, memberId: colleagueId }))?.status).toBe('DONE')
    const comments = (await listComments({ cardId, memberId: colleagueId })).items
    expect(comments.map((item) => [item.body, item.authorId])).toEqual([['Bravo !', null]])
  })

  it('affecte, étiquette et donne une échéance à une carte créée dans une liste', async () => {
    const { adminId, colleagueId, boardId, todo } = await team()
    await rule(boardId, adminId, { type: 'CARD_ENTERS_LIST', listId: todo }, [
      { type: 'ASSIGN', memberId: colleagueId },
      { type: 'ADD_LABEL', label: 'RED' },
      { type: 'SET_DUE_IN_DAYS', days: 3 },
    ])
    const cardId = await card(todo, adminId)

    const result = await getCard({ cardId, memberId: adminId })
    expect(result?.assignees.map((assignee) => assignee.memberId)).toEqual([colleagueId])
    expect(result?.labels).toEqual(['RED'])
    expect(result?.dueOn).toBe(shiftDays(todayInMadagascar(), 3))
  })

  it('range une carte terminée dans « Terminé »', async () => {
    const { adminId, boardId, todo, done } = await team()
    await rule(boardId, adminId, { type: 'CARD_MARKED_DONE' }, [{ type: 'MOVE_TO_LIST', listId: done }])
    const cardId = await card(todo, adminId)

    expect((await setCardStatus({ cardId, memberId: adminId, status: 'DONE' })).status).toBe(200)
    expect((await listCards({ listId: done, memberId: adminId })).map((entry) => entry.cardId)).toEqual([cardId])
  })

  it('ne déclenche rien quand une carte change de place dans sa propre liste', async () => {
    const { adminId, boardId, todo } = await team()
    await card(todo, adminId, 'Première')
    const cardId = await card(todo, adminId, 'Seconde')
    await rule(boardId, adminId, { type: 'CARD_ENTERS_LIST', listId: todo }, [{ type: 'ADD_COMMENT', body: 'Arrivée' }])

    await moveTo(cardId, adminId, todo, todo, 0)
    expect(await commentBodies(cardId, adminId)).toEqual([])
  })

  // Deux règles qui se renvoient la carte : sans garde, le serveur tourne sans fin.
  it('ne tourne pas en boucle quand deux règles se renvoient une carte', async () => {
    const { adminId, boardId, todo, doing, done } = await team()
    await rule(boardId, adminId, { type: 'CARD_ENTERS_LIST', listId: doing }, [{ type: 'MOVE_TO_LIST', listId: done }])
    await rule(boardId, adminId, { type: 'CARD_ENTERS_LIST', listId: done }, [{ type: 'MOVE_TO_LIST', listId: doing }])
    const cardId = await card(todo, adminId)

    await moveTo(cardId, adminId, todo, doing)
    expect((await listCards({ listId: done, memberId: adminId })).map((entry) => entry.cardId)).toEqual([cardId])
    const moves = (await activity({ cardId, memberId: adminId })).items.filter((item) => item.kind === 'CARD_MOVED')
    expect(moves.map((item) => item.actorId), 'le déplacement du membre, puis celui de l’automatisation').toEqual([adminId, null])
  })

  it('n’applique plus une règle supprimée', async () => {
    const { adminId, boardId, todo, done } = await team()
    const ruleId = await rule(boardId, adminId, { type: 'CARD_ENTERS_LIST', listId: done }, [{ type: 'ADD_COMMENT', body: 'Bravo' }])
    expect((await deleteRule({ ruleId, memberId: adminId })).status).toBe(200)

    const cardId = await card(todo, adminId)
    await moveTo(cardId, adminId, todo, done)
    expect(await commentBodies(cardId, adminId)).toEqual([])
  })
})

describe('un événement rejoué', { timeout: 30_000 }, () => {
  async function celebrated() {
    const setup = await team()
    await rule(setup.boardId, setup.adminId, { type: 'CARD_ENTERS_LIST', listId: setup.done }, [{ type: 'ADD_COMMENT', body: 'Bravo' }])
    const cardId = await card(setup.todo, setup.adminId)
    await moveTo(cardId, setup.adminId, setup.todo, setup.done)
    const entries = (await activity({ cardId, memberId: setup.adminId })).items
    const moved = entries.find((item) => item.kind === 'CARD_MOVED' && item.actorId === setup.adminId)
    if (!moved) throw new Error('le déplacement n’est pas au journal')
    return { ...setup, cardId, moved, entries }
  }

  // Une reprise après une panne rejoue des événements déjà traités.
  it('n’applique pas deux fois une règle quand l’événement est rejoué', async () => {
    const { adminId, cardId, moved } = await celebrated()
    await runAutomations({ activityId: moved.activityId })
    expect(await commentBodies(cardId, adminId)).toEqual(['Bravo'])
  })

  it('ne l’applique pas deux fois sous des reprises simultanées', async () => {
    const { adminId, cardId, moved } = await celebrated()
    await Promise.all(Array.from({ length: 3 }, () => runAutomations({ activityId: moved.activityId })))
    expect(await commentBodies(cardId, adminId)).toEqual(['Bravo'])
  })

  it('n’applique rien à une entrée écrite par une automatisation', async () => {
    const { adminId, cardId } = await celebrated()
    const byAutomation = (await activity({ cardId, memberId: adminId })).items.filter((item) => item.actorId === null)
    expect(byAutomation.length, 'le commentaire de l’automatisation est au journal').toBeGreaterThan(0)
    for (const entry of byAutomation) await runAutomations({ activityId: entry.activityId })
    expect(await commentBodies(cardId, adminId)).toEqual(['Bravo'])
  })
})
