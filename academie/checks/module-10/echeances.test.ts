/**
 * Module 10 : Les échéances et les rappels.
 *
 * Chaque membre voit ses échéances, rangées en quatre groupes : en retard,
 * aujourd'hui, demain, plus tard. La veille d'une échéance, chaque membre
 * affecté à la carte reçoit un rappel, une seule fois. Le jour est celui de
 * Madagascar (décision 0006) : une carte due le 15 juillet passe en retard à
 * minuit, heure d'Antananarivo, c'est-à-dire le 15 juillet à 21 h 00 UTC.
 *
 * Contrat attendu, exporté par `src/academie/module-10.ts` : `createMember`,
 * `setupBoard` et `addCard` du module 7, et :
 *
 *   export function setDueDate(input: {
 *     cardId: string; memberId: string
 *     dueOn: string | null              // 'AAAA-MM-JJ', ou null pour la retirer
 *   }): Promise<{ status: number }>     // 200; 400 date invalide; 403 observateur; 404 non-membre
 *
 *   export function completeCard(input: {
 *     cardId: string; memberId: string
 *     now: string                       // l'instant où la carte est terminée
 *   }): Promise<{ status: number }>     // 200; 403; 404; 409 si la carte n'est pas ouverte
 *
 *   export function agenda(input: { memberId: string; now: string }): Promise<{
 *     overdue: AgendaItem[]; today: AgendaItem[]; tomorrow: AgendaItem[]; later: AgendaItem[]
 *   }>
 *   type AgendaItem = { cardId: string; title: string; boardTitle: string; dueOn: string }
 *
 *   export function sendReminders(input: { now: string }): Promise<void>
 *
 *   export function notifications(input: { memberId: string }): Promise<
 *     { kind: string; cardId: string; dueOn: string | null; read: boolean }[]
 *   >                                   // les plus récentes d'abord
 *
 * L'agenda d'un membre montre les cartes ouvertes qui lui sont affectées et
 * qui ont une échéance, sur les tableaux dont il est membre. Chaque groupe est
 * rangé par échéance, la plus proche d'abord. Une carte terminée, archivée, ou
 * sans échéance n'y figure pas. L'état d'une échéance est celui du module 2.
 *
 * `sendReminders` est appelé régulièrement, par exemple toutes les heures. Il
 * crée une notification `DUE_SOON` pour chaque membre affecté à une carte
 * ouverte due le lendemain, heure de Madagascar. Un rappel n'est jamais envoyé
 * deux fois pour la même carte, le même membre et la même échéance; une
 * échéance déplacée reçoit son propre rappel.
 *
 * `now` est passé par le harnais plutôt que lu sur l'horloge : c'est ce qui
 * rend minuit vérifiable.
 */
import { describe, expect, it } from 'vitest'
import {
  addCard,
  agenda,
  completeCard,
  createMember,
  notifications,
  sendReminders,
  setDueDate,
  setupBoard,
} from '../../../src/academie/module-10'

// 6 h 00 UTC, c'est 9 h 00 à Antananarivo, le 15 juillet 2030.
const morning = '2030-07-15T06:00:00.000Z'

async function myBoard(title = 'Coopérative de vanille') {
  const memberId = await createMember({ name: 'Hery' })
  const board = await setupBoard({ ownerId: memberId, title })
  return { memberId, ...board, todo: board.listIds[0] ?? '' }
}

async function groups(memberId: string, now = morning) {
  const result = await agenda({ memberId, now })
  return {
    overdue: result.overdue.map((item) => item.cardId),
    today: result.today.map((item) => item.cardId),
    tomorrow: result.tomorrow.map((item) => item.cardId),
    later: result.later.map((item) => item.cardId),
  }
}

async function reminders(memberId: string) {
  return (await notifications({ memberId })).filter((item) => item.kind === 'DUE_SOON')
}

describe('l’agenda d’un membre', () => {
  it('range ses cartes en retard, aujourd’hui, demain et plus tard', async () => {
    const { memberId, todo } = await myBoard()
    const late = await addCard({ listId: todo, assignees: [memberId], dueOn: '2030-07-14' })
    const today = await addCard({ listId: todo, assignees: [memberId], dueOn: '2030-07-15' })
    const tomorrow = await addCard({ listId: todo, assignees: [memberId], dueOn: '2030-07-16' })
    const later = await addCard({ listId: todo, assignees: [memberId], dueOn: '2030-08-01' })

    expect(await groups(memberId)).toEqual({ overdue: [late], today: [today], tomorrow: [tomorrow], later: [later] })
  })

  it('rend le titre, le tableau et l’échéance de chaque carte', async () => {
    const { memberId, todo } = await myBoard('Coopérative de vanille')
    const cardId = await addCard({ listId: todo, title: 'Peser la récolte', assignees: [memberId], dueOn: '2030-07-15' })

    const result = await agenda({ memberId, now: morning })
    expect(result.today).toEqual([{ cardId, title: 'Peser la récolte', boardTitle: 'Coopérative de vanille', dueOn: '2030-07-15' }])
  })

  it('range chaque groupe par échéance, la plus proche d’abord', async () => {
    const { memberId, todo } = await myBoard()
    const second = await addCard({ listId: todo, assignees: [memberId], dueOn: '2030-07-12' })
    const first = await addCard({ listId: todo, assignees: [memberId], dueOn: '2030-07-10' })
    const fourth = await addCard({ listId: todo, assignees: [memberId], dueOn: '2030-09-01' })
    const third = await addCard({ listId: todo, assignees: [memberId], dueOn: '2030-08-01' })

    const result = await groups(memberId)
    expect(result.overdue).toEqual([first, second])
    expect(result.later).toEqual([third, fourth])
  })

  it('ne montre ni les cartes d’un autre, ni les terminées, ni les archivées, ni celles sans échéance', async () => {
    const { memberId, todo } = await myBoard()
    const colleague = await createMember()
    await addCard({ listId: todo, assignees: [colleague], dueOn: '2030-07-15' })
    await addCard({ listId: todo, assignees: [memberId], dueOn: '2030-07-15', status: 'DONE' })
    await addCard({ listId: todo, assignees: [memberId], dueOn: '2030-07-15', status: 'ARCHIVED' })
    await addCard({ listId: todo, assignees: [memberId] })

    expect(await groups(memberId)).toEqual({ overdue: [], today: [], tomorrow: [], later: [] })
  })
})

describe('minuit à Madagascar', () => {
  // 20 h 59 UTC, c'est 23 h 59 à Antananarivo : encore le 15 juillet.
  it('garde une carte du jour jusqu’à 23 h 59, et la passe en retard à minuit, heure de Madagascar', async () => {
    const { memberId, todo } = await myBoard()
    const due15 = await addCard({ listId: todo, assignees: [memberId], dueOn: '2030-07-15' })
    const due16 = await addCard({ listId: todo, assignees: [memberId], dueOn: '2030-07-16' })

    const lateEvening = await groups(memberId, '2030-07-15T20:59:00.000Z')
    expect(lateEvening.today).toEqual([due15])
    expect(lateEvening.tomorrow).toEqual([due16])

    const midnight = await groups(memberId, '2030-07-15T21:00:00.000Z')
    expect(midnight.overdue).toEqual([due15])
    expect(midnight.today).toEqual([due16])
  })
})

describe('l’échéance et la fin d’une carte', () => {
  it('change et retire l’échéance, et refuse une date invalide avec 400', async () => {
    const { memberId, todo } = await myBoard()
    const cardId = await addCard({ listId: todo, assignees: [memberId] })

    expect((await setDueDate({ cardId, memberId, dueOn: '2030-07-16' })).status).toBe(200)
    expect((await groups(memberId)).tomorrow).toEqual([cardId])
    expect((await setDueDate({ cardId, memberId, dueOn: '2030-13-01' })).status).toBe(400)
    expect((await setDueDate({ cardId, memberId, dueOn: null })).status).toBe(200)
    expect((await groups(memberId)).tomorrow).toEqual([])
  })

  it('refuse l’échéance à un observateur avec 403, et à un non-membre avec 404', async () => {
    const observer = await createMember()
    const { listIds } = await setupBoard({ members: [{ memberId: observer, role: 'OBSERVER' }] })
    const cardId = await addCard({ listId: listIds[0] ?? '' })

    expect((await setDueDate({ cardId, memberId: observer, dueOn: '2030-07-16' })).status).toBe(403)
    expect((await setDueDate({ cardId, memberId: await createMember(), dueOn: '2030-07-16' })).status).toBe(404)
  })

  // Une tâche faite n'est jamais en retard (module 2).
  it('sort de l’agenda une carte terminée, et refuse de la terminer deux fois avec 409', async () => {
    const { memberId, todo } = await myBoard()
    const cardId = await addCard({ listId: todo, assignees: [memberId], dueOn: '2030-07-14' })

    expect((await completeCard({ cardId, memberId, now: morning })).status).toBe(200)
    expect((await groups(memberId)).overdue).toEqual([])
    expect((await completeCard({ cardId, memberId, now: morning })).status).toBe(409)
  })
})

describe('les rappels de la veille', () => {
  it('prévient chaque membre affecté la veille de l’échéance, une seule fois', async () => {
    const memberId = await createMember({ name: 'Hery' })
    const colleague = await createMember()
    const outsider = await createMember()
    const { listIds } = await setupBoard({ ownerId: memberId, members: [{ memberId: colleague, role: 'MEMBER' }] })
    const cardId = await addCard({ listId: listIds[0] ?? '', assignees: [memberId, colleague], dueOn: '2030-07-16' })

    await sendReminders({ now: morning })
    await sendReminders({ now: '2030-07-15T07:00:00.000Z' })

    for (const assignee of [memberId, colleague]) {
      expect(await reminders(assignee)).toEqual([{ kind: 'DUE_SOON', cardId, dueOn: '2030-07-16', read: false }])
    }
    expect(await reminders(outsider)).toEqual([])
  })

  it('ne prévient pas deux jours avant, mais le fait à minuit, heure de Madagascar', async () => {
    const { memberId, todo } = await myBoard()
    const cardId = await addCard({ listId: todo, assignees: [memberId], dueOn: '2030-07-17' })

    await sendReminders({ now: '2030-07-15T20:59:00.000Z' })
    expect(await reminders(memberId)).toEqual([])

    await sendReminders({ now: '2030-07-15T21:00:00.000Z' })
    expect((await reminders(memberId)).map((item) => item.cardId)).toEqual([cardId])
  })

  it('ne prévient pas pour une carte terminée', async () => {
    const { memberId, todo } = await myBoard()
    await addCard({ listId: todo, assignees: [memberId], dueOn: '2030-07-16', status: 'DONE' })

    await sendReminders({ now: morning })
    expect(await reminders(memberId)).toEqual([])
  })

  it('prévient de nouveau quand l’échéance est déplacée', async () => {
    const { memberId, todo } = await myBoard()
    const cardId = await addCard({ listId: todo, assignees: [memberId], dueOn: '2030-07-16' })
    await sendReminders({ now: morning })

    await setDueDate({ cardId, memberId, dueOn: '2030-07-18' })
    await sendReminders({ now: '2030-07-17T06:00:00.000Z' })
    expect((await reminders(memberId)).map((item) => item.dueOn)).toEqual(['2030-07-18', '2030-07-16'])
  })
})
