/**
 * Module 17 : Le tableau de bord. Module Platine.
 *
 * Comme la vue « Tableau de bord » de Trello, chaque tableau résume son état
 * en quelques chiffres : combien de cartes ouvertes par liste, qui porte quoi,
 * ce qui est en retard, combien de cartes ont été terminées chaque semaine, et
 * en combien de jours, en moyenne. Ce sont des agrégats : des nombres calculés
 * sur un groupe de lignes, par la base.
 *
 * Contrat attendu, exporté par `src/academie/module-17.ts` :
 *
 *   export function createMember(input?: { name?: string }): Promise<string>
 *   export function setupBoard(input?: { ... })                        // module 7
 *   export function addCard(input: { ...; createdAt?: string })        // module 7
 *   export function completeCard(input: { cardId; memberId; now })     // module 10
 *   export function setCardStatus(input: { cardId; memberId; status }) // module 6
 *
 *   export function dashboard(input: {
 *     boardId: string; memberId: string
 *     now: string                       // un instant ISO 8601
 *   }): Promise<{
 *     status: number                    // 200 pour tout membre; 404 non-membre
 *     lists: { listId: string; title: string; open: number }[]
 *     members: { memberId: string; name: string; open: number; overdue: number }[]
 *     unassigned: number
 *     overdue: number
 *     doneByWeek: { weekStart: string; count: number }[]
 *     averageDaysToDone: number | null
 *   }>
 *
 *   lists              chaque liste, dans son ordre, avec son nombre de cartes ouvertes (OPEN)
 *   members            chaque membre du tableau, rangé par nom, avec ses cartes ouvertes
 *                      affectées, et parmi elles celles en retard
 *   unassigned         les cartes ouvertes affectées à personne
 *   overdue            les cartes ouvertes dont l'échéance est passée, à Madagascar
 *   doneByWeek         les quatre dernières semaines, semaine en cours comprise, la plus
 *                      ancienne d'abord, avec 0 pour une semaine sans carte terminée. Une
 *                      semaine commence le lundi à minuit, heure de Madagascar
 *                      (décision 0006); weekStart est la date de ce lundi
 *   averageDaysToDone  pour les cartes terminées pendant ces quatre semaines, le temps moyen
 *                      entre la création et la fin, en jours, arrondi au dixième; null sans
 *                      carte terminée
 *
 * Une carte compte comme terminée à l'instant où elle est passée à DONE; une
 * carte rouverte ne compte plus. Une carte terminée puis archivée compte
 * toujours, une carte supprimée jamais. Le tableau de bord ne rend aucun
 * courriel ni téléphone.
 */
import { describe, expect, it } from 'vitest'
import {
  addCard,
  completeCard,
  createMember,
  dashboard,
  setCardStatus,
  setupBoard,
} from '../../../src/academie/module-17'

// Le mercredi 17 juillet 2030, 9 h 00 à Madagascar. La semaine a commencé le lundi 15.
const now = '2030-07-17T06:00:00.000Z'

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

async function finished(listId: string, memberId: string, doneAt: string, createdAt?: string) {
  const cardId = await addCard({ listId, createdAt })
  const result = await completeCard({ cardId, memberId, now: doneAt })
  expect(result.status, 'la carte doit se terminer').toBe(200)
  return cardId
}

describe('l’état du tableau', () => {
  it('compte les cartes ouvertes de chaque liste, dans l’ordre des listes', async () => {
    const { adminId, boardId, todo, doing } = await team()
    await addCard({ listId: todo })
    await addCard({ listId: todo })
    await addCard({ listId: doing })
    await addCard({ listId: doing, status: 'DONE' })
    await addCard({ listId: todo, status: 'ARCHIVED' })

    const result = await dashboard({ boardId, memberId: adminId, now })
    expect(result.status).toBe(200)
    expect(result.lists.map((list) => [list.title, list.open])).toEqual([
      ['À faire', 2],
      ['En cours', 1],
      ['Terminé', 0],
    ])
  })

  it('dit qui porte quoi, ce qui est en retard, et ce que personne ne porte', async () => {
    const { adminId, colleagueId, observerId, boardId, todo } = await team()
    await addCard({ listId: todo, assignees: [colleagueId], dueOn: '2030-07-16' })
    await addCard({ listId: todo, assignees: [colleagueId], dueOn: '2030-07-17' })
    await addCard({ listId: todo, assignees: [colleagueId, adminId] })
    await addCard({ listId: todo, dueOn: '2030-07-01' })
    await addCard({ listId: todo, assignees: [adminId], dueOn: '2030-07-01', status: 'DONE' })

    const result = await dashboard({ boardId, memberId: observerId, now })
    expect(result.members).toEqual([
      { memberId: observerId, name: 'Fara', open: 0, overdue: 0 },
      { memberId: adminId, name: 'Mialy', open: 1, overdue: 0 },
      { memberId: colleagueId, name: 'Tojo', open: 3, overdue: 1 },
    ])
    expect(result.unassigned).toBe(1)
    expect(result.overdue, 'une carte terminée n’est jamais en retard').toBe(2)
  })

  // 21 h 00 UTC, c'est minuit à Madagascar : la carte due le 17 passe en retard.
  it('compte les retards à minuit, heure de Madagascar', async () => {
    const { adminId, boardId, todo } = await team()
    await addCard({ listId: todo, dueOn: '2030-07-17' })

    expect((await dashboard({ boardId, memberId: adminId, now: '2030-07-17T20:59:00.000Z' })).overdue).toBe(0)
    expect((await dashboard({ boardId, memberId: adminId, now: '2030-07-17T21:00:00.000Z' })).overdue).toBe(1)
  })

  it('répond 404 à un non-membre', async () => {
    const { boardId } = await team()
    expect((await dashboard({ boardId, memberId: await createMember(), now })).status).toBe(404)
  })
})

describe('les cartes terminées par semaine', () => {
  it('rend quatre semaines, la plus ancienne d’abord, avec les semaines vides', async () => {
    const { adminId, boardId } = await team()
    const result = await dashboard({ boardId, memberId: adminId, now })
    expect(result.doneByWeek).toEqual([
      { weekStart: '2030-06-24', count: 0 },
      { weekStart: '2030-07-01', count: 0 },
      { weekStart: '2030-07-08', count: 0 },
      { weekStart: '2030-07-15', count: 0 },
    ])
    expect(result.averageDaysToDone).toBeNull()
  })

  // Dimanche 23 h 59 ou lundi 0 h 00, à Madagascar : deux semaines différentes.
  it('range chaque carte dans sa semaine de Madagascar', async () => {
    const { adminId, boardId, todo } = await team()
    await finished(todo, adminId, '2030-07-14T20:59:00.000Z')
    await finished(todo, adminId, '2030-07-14T21:00:00.000Z')
    await finished(todo, adminId, '2030-07-16T10:00:00.000Z')
    await finished(todo, adminId, '2030-06-24T06:00:00.000Z')
    await finished(todo, adminId, '2030-06-23T20:00:00.000Z')

    const result = await dashboard({ boardId, memberId: adminId, now })
    expect(result.doneByWeek).toEqual([
      { weekStart: '2030-06-24', count: 1 },
      { weekStart: '2030-07-01', count: 0 },
      { weekStart: '2030-07-08', count: 1 },
      { weekStart: '2030-07-15', count: 2 },
    ])
  })

  it('compte une carte terminée puis archivée, mais pas une carte rouverte', async () => {
    const { adminId, boardId, todo } = await team()
    const archived = await finished(todo, adminId, '2030-07-16T10:00:00.000Z')
    await setCardStatus({ cardId: archived, memberId: adminId, status: 'ARCHIVED' })
    const reopened = await finished(todo, adminId, '2030-07-16T11:00:00.000Z')
    await setCardStatus({ cardId: reopened, memberId: adminId, status: 'OPEN' })

    const result = await dashboard({ boardId, memberId: adminId, now })
    expect(result.doneByWeek.at(-1)).toEqual({ weekStart: '2030-07-15', count: 1 })
  })

  it('donne le temps moyen entre la création et la fin, arrondi au dixième de jour', async () => {
    const { adminId, boardId, todo } = await team()
    await finished(todo, adminId, '2030-07-17T06:00:00.000Z', '2030-07-15T06:00:00.000Z')
    await finished(todo, adminId, '2030-07-16T06:00:00.000Z', '2030-07-15T06:00:00.000Z')
    await finished(todo, adminId, '2030-07-17T06:00:00.000Z', '2030-07-16T06:00:00.000Z')

    expect((await dashboard({ boardId, memberId: adminId, now })).averageDaysToDone).toBe(1.3)
  })
})
