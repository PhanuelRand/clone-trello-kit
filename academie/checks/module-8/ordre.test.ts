/**
 * Module 8 : L'ordre des cartes et leurs déplacements.
 *
 * Un membre glisse une carte en haut de sa liste, entre deux autres, ou dans
 * une autre liste. Chaque carte porte une position à virgule (décision 0002) :
 * un déplacement n'écrit qu'une seule ligne, sauf quand la liste doit être
 * renumérotée. Chaque carte porte aussi une version (décision 0008) : un
 * déplacement envoie celle que le membre a sous les yeux, et une version
 * dépassée reçoit 409.
 *
 * Les déplacements simultanés ne sont pas vérifiés ici, mais au module 12.
 * C'est voulu : une implémentation qui lit puis écrit passe cette suite et
 * échoue celle-là, et c'est ce que le module 12 apprend à diagnostiquer.
 *
 * Contrat attendu, exporté par `src/academie/module-8.ts` : `createMember`,
 * `setupBoard` et `addCard` du module 7, et :
 *
 *   export function listCards(input: { listId: string; memberId: string }): Promise<
 *     { cardId: string; title: string; version: number; position: number }[]
 *   >                                   // dans l'ordre; [] pour qui n'est pas membre
 *
 *   export function moveCard(input: {
 *     cardId: string; memberId: string
 *     toListId: string                  // la même liste, ou une autre du même tableau
 *     index: number                     // la place voulue : 0 en haut; au-delà du bas, en bas
 *     expectedVersion: number           // la version que le membre a sous les yeux
 *   }): Promise<{
 *     status: number                    // 200; 400 (place invalide, liste d'un autre tableau);
 *                                       // 403 observateur; 404 non-membre; 409 version dépassée
 *     version?: number                  // la nouvelle version, ou l'actuelle avec 409
 *   }>
 *
 *   export function listLists(input: { boardId: string; memberId: string }): Promise<
 *     { listId: string; title: string }[]
 *   >                                   // dans l'ordre; [] pour qui n'est pas membre
 *
 *   export function moveList(input: {
 *     listId: string; memberId: string; index: number
 *   }): Promise<{ status: number }>     // 200; 400; 403; 404
 *
 * La place `index` se compte dans la liste d'arrivée, une fois la carte retirée
 * de sa place d'origine : dans A, B, C, D, déplacer D à la place 2 donne
 * A, B, D, C.
 */
import { describe, expect, it } from 'vitest'
import {
  addCard,
  createMember,
  listCards,
  listLists,
  moveCard,
  moveList,
  setupBoard,
} from '../../../src/academie/module-8'

async function board() {
  const ownerId = await createMember({ name: 'Tojo' })
  const { boardId, listIds } = await setupBoard({ ownerId })
  return { ownerId, boardId, todo: listIds[0] ?? '', doing: listIds[1] ?? '', done: listIds[2] ?? '' }
}

async function titles(listId: string, memberId: string) {
  return (await listCards({ listId, memberId })).map((card) => card.title)
}

async function versionOf(listId: string, memberId: string, cardId: string) {
  return (await listCards({ listId, memberId })).find((card) => card.cardId === cardId)?.version ?? 0
}

async function move(memberId: string, listId: string, cardId: string, toListId: string, index: number) {
  const result = await moveCard({
    cardId,
    memberId,
    toListId,
    index,
    expectedVersion: await versionOf(listId, memberId, cardId),
  })
  expect(result.status, 'le déplacement doit réussir').toBe(200)
  return result
}

describe('déplacer une carte dans sa liste', () => {
  it('la place en haut, entre deux autres, puis en bas', async () => {
    const { ownerId, todo } = await board()
    const ids: Record<string, string> = {}
    for (const title of ['A', 'B', 'C', 'D']) ids[title] = await addCard({ listId: todo, title })

    await move(ownerId, todo, ids.D ?? '', todo, 0)
    expect(await titles(todo, ownerId)).toEqual(['D', 'A', 'B', 'C'])

    await move(ownerId, todo, ids.D ?? '', todo, 2)
    expect(await titles(todo, ownerId)).toEqual(['A', 'B', 'D', 'C'])

    await move(ownerId, todo, ids.A ?? '', todo, 99)
    expect(await titles(todo, ownerId)).toEqual(['B', 'D', 'C', 'A'])
  })

  // Une position à virgule : un déplacement n'écrit qu'une ligne (décision 0002).
  it('ne change la position d’aucune autre carte', async () => {
    const { ownerId, todo } = await board()
    const ids = []
    for (const title of ['A', 'B', 'C', 'D', 'E']) ids.push(await addCard({ listId: todo, title }))
    const before = await listCards({ listId: todo, memberId: ownerId })

    await move(ownerId, todo, ids[4] ?? '', todo, 1)
    const after = await listCards({ listId: todo, memberId: ownerId })
    for (const card of before.filter((entry) => entry.cardId !== ids[4])) {
      expect(after.find((entry) => entry.cardId === card.cardId)?.position, `position de ${card.title}`).toBe(
        card.position,
      )
    }
  })

  // Soixante fois au même endroit : l'écart finit trop petit, il faut renuméroter.
  it('garde l’ordre quand on glisse soixante cartes au même endroit', { timeout: 60_000 }, async () => {
    const { ownerId, todo } = await board()
    await addCard({ listId: todo, title: 'premier' })
    await addCard({ listId: todo, title: 'dernier' })
    const expected = ['premier', 'dernier']
    for (let index = 1; index <= 60; index += 1) {
      const title = `glissée-${index}`
      const cardId = await addCard({ listId: todo, title })
      await move(ownerId, todo, cardId, todo, 1)
      expected.splice(1, 0, title)
    }

    const cards = await listCards({ listId: todo, memberId: ownerId })
    expect(cards.map((card) => card.title)).toEqual(expected)
    for (let index = 1; index < cards.length; index += 1) {
      expect(
        (cards[index]?.position ?? 0) > (cards[index - 1]?.position ?? 0),
        'des positions strictement croissantes : renumérotez quand le milieu n’est plus entre ses voisins',
      ).toBe(true)
    }
  })
})

describe('déplacer une carte vers une autre liste', () => {
  it('la range à la place demandée de la liste d’arrivée', async () => {
    const { ownerId, todo, doing } = await board()
    const card = await addCard({ listId: todo, title: 'Envoyer les faire-part' })
    await addCard({ listId: doing, title: 'Choisir le traiteur' })
    await addCard({ listId: doing, title: 'Louer la sono' })

    await move(ownerId, todo, card, doing, 1)
    expect(await titles(todo, ownerId)).toEqual([])
    expect(await titles(doing, ownerId)).toEqual(['Choisir le traiteur', 'Envoyer les faire-part', 'Louer la sono'])
  })

  it('range une carte en haut d’une liste vide', async () => {
    const { ownerId, todo, done } = await board()
    const card = await addCard({ listId: todo, title: 'Payer la salle' })
    await move(ownerId, todo, card, done, 0)
    expect(await titles(done, ownerId)).toEqual(['Payer la salle'])
  })

  it('refuse une liste d’un autre tableau, même du même membre, avec 400', async () => {
    const { ownerId, todo } = await board()
    const other = await setupBoard({ ownerId })
    const card = await addCard({ listId: todo, title: 'Rester ici' })

    const result = await moveCard({ cardId: card, memberId: ownerId, toListId: other.listIds[0] ?? '', index: 0, expectedVersion: 1 })
    expect(result.status).toBe(400)
    expect(await titles(todo, ownerId)).toEqual(['Rester ici'])
  })

  it('refuse une place négative ou à virgule, avec 400', async () => {
    const { ownerId, todo } = await board()
    const card = await addCard({ listId: todo })
    expect((await moveCard({ cardId: card, memberId: ownerId, toListId: todo, index: -1, expectedVersion: 1 })).status).toBe(400)
    expect((await moveCard({ cardId: card, memberId: ownerId, toListId: todo, index: 1.5, expectedVersion: 1 })).status).toBe(400)
  })
})

describe('la version d’une carte', () => {
  it('augmente la version à chaque déplacement, et la rend', async () => {
    const { ownerId, todo, doing } = await board()
    const card = await addCard({ listId: todo })
    expect(await versionOf(todo, ownerId, card)).toBe(1)

    const moved = await moveCard({ cardId: card, memberId: ownerId, toListId: doing, index: 0, expectedVersion: 1 })
    expect(moved).toEqual({ status: 200, version: 2 })
    expect(await versionOf(doing, ownerId, card)).toBe(2)
  })

  // Le membre agissait sur une carte qui avait changé depuis qu'il l'avait vue.
  it('refuse un déplacement fondé sur une version dépassée, avec 409 et la version actuelle', async () => {
    const { ownerId, todo, doing, done } = await board()
    const card = await addCard({ listId: todo, title: 'Disputée' })
    await moveCard({ cardId: card, memberId: ownerId, toListId: doing, index: 0, expectedVersion: 1 })

    const stale = await moveCard({ cardId: card, memberId: ownerId, toListId: done, index: 0, expectedVersion: 1 })
    expect(stale).toEqual({ status: 409, version: 2 })
    expect(await titles(doing, ownerId), 'la carte n’a pas bougé').toEqual(['Disputée'])
    expect(await titles(done, ownerId)).toEqual([])
  })
})

describe('les droits', () => {
  it('refuse le déplacement à un observateur avec 403, et à un non-membre avec 404', async () => {
    const { boardId, todo, doing } = await board()
    const card = await addCard({ listId: todo })
    const observer = await createMember()
    const { ownerId: stranger } = await setupBoard()
    const withObserver = await setupBoard({ members: [{ memberId: observer, role: 'OBSERVER' }] })
    const watched = await addCard({ listId: withObserver.listIds[0] ?? '' })

    expect(
      (await moveCard({ cardId: watched, memberId: observer, toListId: withObserver.listIds[1] ?? '', index: 0, expectedVersion: 1 })).status,
    ).toBe(403)
    expect((await moveCard({ cardId: card, memberId: stranger, toListId: doing, index: 0, expectedVersion: 1 })).status).toBe(404)
    expect(await listCards({ listId: todo, memberId: stranger }), 'aucune carte pour un non-membre').toEqual([])
    expect(await listLists({ boardId, memberId: stranger })).toEqual([])
  })
})

describe('l’ordre des listes', () => {
  it('déplace une liste, et refuse à un observateur', async () => {
    const ownerId = await createMember()
    const observer = await createMember()
    const { boardId, listIds } = await setupBoard({ ownerId, members: [{ memberId: observer, role: 'OBSERVER' }] })

    expect((await moveList({ listId: listIds[2] ?? '', memberId: ownerId, index: 0 })).status).toBe(200)
    expect((await listLists({ boardId, memberId: ownerId })).map((list) => list.title)).toEqual([
      'Terminé',
      'À faire',
      'En cours',
    ])
    expect((await moveList({ listId: listIds[0] ?? '', memberId: observer, index: 2 })).status).toBe(403)
  })
})
