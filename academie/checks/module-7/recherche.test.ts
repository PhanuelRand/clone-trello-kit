/**
 * Module 7 : La recherche et ses filtres.
 *
 * La recherche trouve les cartes d'un membre parmi tous ses tableaux, les plus
 * récemment modifiées d'abord, page par page. Elle ne cherche que dans les
 * tableaux dont il est membre : un tableau est privé (décision 0001).
 *
 * Contrat attendu, exporté par `src/academie/module-7.ts` :
 *
 *   export function createMember(input?: { name?: string; email?: string }): Promise<string>
 *
 *   export function setupBoard(input?: {
 *     ownerId?: string                      // par défaut un administrateur neuf
 *     title?: string                        // par défaut 'Tableau de vérification'
 *     members?: { memberId: string; role: 'ADMIN' | 'MEMBER' | 'OBSERVER' }[]
 *   }): Promise<{ boardId: string; ownerId: string; listIds: string[] }>
 *                                           // un tableau et ses trois listes, « À faire »,
 *                                           // « En cours » et « Terminé », sans invitation ni limite
 *
 *   export function addCard(input: {
 *     listId: string
 *     title?: string                        // par défaut 'Carte de vérification'
 *     description?: string                  // par défaut ''
 *     labels?: string[]                     // par défaut []
 *     assignees?: string[]                  // par défaut []
 *     dueOn?: string | null                 // par défaut null
 *     status?: 'OPEN' | 'DONE' | 'ARCHIVED' // par défaut 'OPEN'
 *     updatedAt?: string                    // l'instant de la dernière modification; par défaut maintenant
 *     createdAt?: string                    // l'instant de la création; par défaut maintenant
 *   }): Promise<string>                     // une carte en bas de la liste, sans autre contrôle
 *
 *   export function search(input: {
 *     memberId: string                      // celui qui cherche
 *     query?: string                        // des mots, cherchés dans le titre et la description
 *     label?: string                        // une étiquette
 *     assignee?: string                     // l'identifiant d'un membre affecté
 *     boardId?: string                      // un seul tableau
 *     cursor?: string | null; limit?: number   // limit : 20 par défaut
 *   }): Promise<{
 *     items: {
 *       cardId: string; boardId: string
 *       boardTitle: string; listTitle: string
 *       title: string; labels: string[]; dueOn: string | null
 *     }[]
 *     nextCursor: string | null
 *   }>
 *
 * Une carte apparaît quand :
 *   - son tableau compte celui qui cherche parmi ses membres, quel que soit
 *     son rôle;
 *   - elle est ouverte ou terminée, ni archivée ni supprimée;
 *   - chaque mot de la recherche figure dans son titre ou sa description,
 *     sans tenir compte des majuscules ni des accents : « echeance » trouve
 *     « Échéance »;
 *   - elle porte l'étiquette demandée, est affectée au membre demandé, et se
 *     trouve sur le tableau demandé, quand ces filtres sont donnés.
 *
 * Les cartes modifiées le plus récemment viennent d'abord. Un résultat ne
 * contient ni courriel ni téléphone. La pagination est par curseur, jamais par
 * OFFSET : une carte modifiée pendant qu'on feuillette ne doit ni décaler ni
 * dupliquer les résultats déjà vus.
 */
import { describe, expect, it } from 'vitest'
import { addCard, createMember, search, setupBoard } from '../../../src/academie/module-7'

/** Un instant d'il y a `minutes` minutes, pour ordonner les cartes. */
function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

/** Un membre neuf et son tableau : ses recherches ne voient que ses cartes. */
async function ownBoard(title?: string) {
  const memberId = await createMember({ name: 'Hery' })
  const board = await setupBoard({ ownerId: memberId, title })
  return { memberId, ...board, todo: board.listIds[0] ?? '' }
}

async function idsFound(input: Parameters<typeof search>[0]) {
  return (await search(input)).items.map((item) => item.cardId)
}

describe('les mots de la recherche', () => {
  it('trouve un mot dans le titre ou dans la description', async () => {
    const { memberId, todo } = await ownBoard()
    const inTitle = await addCard({ listId: todo, title: 'Commander le gâteau' })
    const inDescription = await addCard({
      listId: todo,
      title: 'Prévenir la pâtisserie',
      description: 'Le gâteau doit être livré le samedi matin.',
    })
    await addCard({ listId: todo, title: 'Louer les chaises' })

    expect((await idsFound({ memberId, query: 'gâteau' })).sort()).toEqual([inTitle, inDescription].sort())
  })

  it('ne tient compte ni des majuscules ni des accents', async () => {
    const { memberId, todo } = await ownBoard()
    const card = await addCard({ listId: todo, title: 'ÉCHÉANCE du dossier de subvention' })

    expect(await idsFound({ memberId, query: 'echeance' })).toEqual([card])
    expect(await idsFound({ memberId, query: 'Subvention' })).toEqual([card])
  })

  it('exige chaque mot quand la recherche en contient plusieurs', async () => {
    const { memberId, todo } = await ownBoard()
    const both = await addCard({ listId: todo, title: 'Peser la vanille de Sambava' })
    await addCard({ listId: todo, title: 'Peser le girofle' })

    expect(await idsFound({ memberId, query: 'peser vanille' })).toEqual([both])
  })
})

describe('les tableaux de celui qui cherche', () => {
  // Le cœur du module : chercher ne doit jamais ouvrir un tableau privé.
  it('ne trouve jamais une carte d’un tableau dont on n’est pas membre', async () => {
    const mine = await ownBoard()
    const theirs = await ownBoard()
    const own = await addCard({ listId: mine.todo, title: 'Budget de la fête de quartier' })
    await addCard({ listId: theirs.todo, title: 'Budget de la fête de quartier' })

    expect(await idsFound({ memberId: mine.memberId, query: 'budget' })).toEqual([own])
  })

  it('cherche dans tous les tableaux du membre, observateur compris', async () => {
    const { memberId, todo } = await ownBoard('Association des parents')
    const other = await ownBoard('Coopérative de vanille')
    const observed = await setupBoard({ members: [{ memberId, role: 'OBSERVER' }] })
    const first = await addCard({ listId: todo, title: 'Réunion de rentrée' })
    const second = await addCard({ listId: observed.listIds[0] ?? '', title: 'Réunion du bureau' })
    await addCard({ listId: other.todo, title: 'Réunion des producteurs' })

    expect((await idsFound({ memberId, query: 'reunion' })).sort()).toEqual([first, second].sort())
  })

  it('ne trouve ni les cartes archivées, ni les supprimées, mais trouve les terminées', async () => {
    const { memberId, todo } = await ownBoard()
    const done = await addCard({ listId: todo, title: 'Facture du traiteur', status: 'DONE' })
    await addCard({ listId: todo, title: 'Facture de la sono', status: 'ARCHIVED' })

    expect(await idsFound({ memberId, query: 'facture' })).toEqual([done])
  })
})

describe('les filtres', () => {
  it('filtre par étiquette', async () => {
    const { memberId, todo } = await ownBoard()
    const urgent = await addCard({ listId: todo, labels: ['RED', 'BLUE'] })
    await addCard({ listId: todo, labels: ['BLUE'] })

    expect(await idsFound({ memberId, label: 'RED' })).toEqual([urgent])
  })

  it('filtre par membre affecté', async () => {
    const { memberId, boardId, todo } = await ownBoard()
    const colleague = await createMember({ name: 'Fanja' })
    const theirs = await setupBoard({ ownerId: memberId, members: [{ memberId: colleague, role: 'MEMBER' }] })
    const assigned = await addCard({ listId: theirs.listIds[0] ?? '', assignees: [colleague] })
    await addCard({ listId: todo, assignees: [memberId] })

    expect(await idsFound({ memberId, assignee: colleague })).toEqual([assigned])
    expect((await idsFound({ memberId, boardId })).length).toBe(1)
  })

  it('filtre par tableau', async () => {
    const { memberId, boardId, todo } = await ownBoard()
    const other = await setupBoard({ ownerId: memberId })
    const here = await addCard({ listId: todo })
    await addCard({ listId: other.listIds[0] ?? '' })

    expect(await idsFound({ memberId, boardId })).toEqual([here])
  })

  it('combine les mots, l’étiquette et le tableau', async () => {
    const { memberId, boardId, todo } = await ownBoard()
    const other = await setupBoard({ ownerId: memberId })
    const match = await addCard({ listId: todo, title: 'Imprimer les affiches', labels: ['GREEN'] })
    await addCard({ listId: todo, title: 'Imprimer les badges', labels: ['RED'] })
    await addCard({ listId: other.listIds[0] ?? '', title: 'Imprimer les affiches', labels: ['GREEN'] })

    expect(await idsFound({ memberId, query: 'imprimer', label: 'GREEN', boardId })).toEqual([match])
  })
})

describe('ce qu’un résultat montre', () => {
  it('range les cartes modifiées le plus récemment d’abord', async () => {
    const { memberId, todo } = await ownBoard()
    const old = await addCard({ listId: todo, updatedAt: minutesAgo(30) })
    const recent = await addCard({ listId: todo, updatedAt: minutesAgo(1) })
    const middle = await addCard({ listId: todo, updatedAt: minutesAgo(10) })

    expect(await idsFound({ memberId })).toEqual([recent, middle, old])
  })

  it('rend le titre, le tableau, la liste, les étiquettes et l’échéance, jamais de contact', async () => {
    const { memberId, boardId, listIds } = await ownBoard('Mariage de Mialy et Tojo')
    await addCard({ listId: listIds[1] ?? '', title: 'Essayer la robe', labels: ['PURPLE'], dueOn: '2030-07-15' })

    const [item] = (await search({ memberId })).items
    expect(item).toMatchObject({
      boardId,
      boardTitle: 'Mariage de Mialy et Tojo',
      listTitle: 'En cours',
      title: 'Essayer la robe',
      labels: ['PURPLE'],
      dueOn: '2030-07-15',
    })
    expect(Object.keys(item ?? {}).join(' '), 'aucune donnée de contact dans un résultat').not.toMatch(
      /email|courriel|phone|telephone|mail/i,
    )
  })
})

describe('pagination par curseur', () => {
  it('parcourt toutes les cartes sans doublon ni oubli', async () => {
    const { memberId, todo } = await ownBoard()
    const created = []
    for (let index = 0; index < 7; index += 1) created.push(await addCard({ listId: todo }))

    const seen: string[] = []
    let cursor: string | null = null
    for (let page = 0; page < 20; page += 1) {
      const result: Awaited<ReturnType<typeof search>> = await search({ memberId, cursor, limit: 3 })
      seen.push(...result.items.map((item) => item.cardId))
      cursor = result.nextCursor
      if (!cursor) break
    }
    expect(seen).toHaveLength(created.length)
    expect([...seen].sort()).toEqual([...created].sort())
  })

  // Deux cartes modifiées au même instant : le curseur doit savoir les départager.
  it('départage les cartes modifiées au même instant', async () => {
    const { memberId, todo } = await ownBoard()
    const instant = minutesAgo(5)
    const created = []
    for (let index = 0; index < 5; index += 1) created.push(await addCard({ listId: todo, updatedAt: instant }))

    const first = await search({ memberId, limit: 2 })
    const second = await search({ memberId, cursor: first.nextCursor, limit: 2 })
    const third = await search({ memberId, cursor: second.nextCursor, limit: 2 })
    const seen = [...first.items, ...second.items, ...third.items].map((item) => item.cardId)
    expect([...seen].sort()).toEqual([...created].sort())
  })

  // Le test que OFFSET ne passe pas : une modification décale toutes les pages.
  it('ne décale pas les pages déjà vues quand une carte arrive entre deux', async () => {
    const { memberId, todo } = await ownBoard()
    for (let index = 0; index < 6; index += 1) await addCard({ listId: todo, updatedAt: minutesAgo(60 - index) })

    const first = await search({ memberId, limit: 3 })
    expect(first.nextCursor, 'six cartes par pages de trois : il reste une page').toBeTruthy()

    await addCard({ listId: todo })

    const second = await search({ memberId, cursor: first.nextCursor, limit: 3 })
    const overlap = second.items
      .map((item) => item.cardId)
      .filter((id) => first.items.some((item) => item.cardId === id))
    expect(overlap, 'aucune carte de la page 1 ne doit réapparaître page 2').toEqual([])
    expect(second.items).toHaveLength(3)
  })
})
