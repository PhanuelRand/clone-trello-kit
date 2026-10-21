/**
 * Module 6 : Le tableau, ses listes, ses cartes et leurs pièces jointes.
 *
 * Contrat attendu, exporté par `src/academie/module-6.ts` :
 *
 *   export type BoardRole = 'ADMIN' | 'MEMBER' | 'OBSERVER'
 *   export type Label = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'PURPLE' | 'BLUE'
 *
 *   export function createMember(input?: {
 *     name?: string                     // par défaut 'Membre'
 *     email?: string                    // par défaut un courriel inventé
 *     phone?: string                    // facultatif
 *   }): Promise<string>                 // l'identifiant d'un compte
 *
 *   export function createBoard(input: {
 *     ownerId: string; title: string
 *   }): Promise<{ status: number; boardId?: string; reason?: string }>
 *                                       // 201 : le tableau, son créateur ADMIN, et trois listes,
 *                                       //       « À faire », « En cours » et « Terminé »; 400 sinon
 *
 *   export function addBoardMember(input: {
 *     boardId: string; memberId: string; role: BoardRole
 *   }): Promise<void>                   // pour les vérifications : sans invitation ni limite
 *
 *   export function getBoard(input: { boardId: string; memberId: string }): Promise<{
 *     status: number                    // 200; 404 si le membre n'en fait pas partie
 *     board?: {
 *       boardId: string; title: string
 *       role: BoardRole                 // le rôle de celui qui lit
 *       lists: {
 *         listId: string; title: string
 *         cards: { cardId: string; title: string; status: string; labels: Label[]; dueOn: string | null }[]
 *       }[]
 *     }
 *   }>
 *
 *   export function createList(input: {
 *     boardId: string; memberId: string; title: string
 *   }): Promise<{ status: number; listId?: string }>       // 201; 400; 403; 404
 *
 *   export function createCard(input: {
 *     listId: string; memberId: string; title: string; description?: string
 *   }): Promise<{ status: number; cardId?: string; reason?: string }>   // 201; 400; 403; 404
 *
 *   export function updateCard(input: {
 *     cardId: string; memberId: string
 *     title?: string; description?: string
 *     dueOn?: string | null             // 'AAAA-MM-JJ', ou null pour retirer l'échéance
 *     labels?: Label[]                  // remplace les étiquettes
 *     assignees?: string[]              // remplace les membres affectés à la carte
 *   }): Promise<{ status: number; reason?: string }>        // 200; 400; 403; 404
 *
 *   export function getCard(input: { cardId: string; memberId: string }): Promise<null | {
 *     cardId: string; boardId: string; listId: string
 *     title: string; description: string; status: string
 *     dueOn: string | null; labels: Label[]
 *     assignees: { memberId: string; name: string }[]
 *     version: number                   // 1 à la création, plus 1 à chaque modification
 *   }>                                  // null si la carte est supprimée, ou si le membre
 *                                       // ne fait pas partie du tableau
 *
 *   export function setCardStatus(input: {
 *     cardId: string; memberId: string; status: 'OPEN' | 'DONE' | 'ARCHIVED' | 'DELETED'
 *   }): Promise<{ status: number }>     // 200; 403; 404; 409 si le passage est interdit (module 2)
 *
 *   export function createUploadUrl(input: {
 *     memberId: string; cardId: string; contentType: string; sizeBytes: number
 *   }): Promise<
 *     | { url: string; key: string; expiresAt: string }   // ISO 8601
 *     | { refused: string }                               // motif lisible
 *   >
 *
 *   export function attachFile(input: {
 *     memberId: string; cardId: string; key: string; name: string
 *   }): Promise<{ attached: boolean; reason?: string }>
 *
 *   export function listAttachments(input: { cardId: string; memberId: string }): Promise<
 *     { key: string; name: string; isCover: boolean }[]
 *   >                                   // [] pour qui ne fait pas partie du tableau
 *
 *   export function setCover(input: {
 *     memberId: string; cardId: string; key: string
 *   }): Promise<{ status: number }>     // 200; 400 si ce n'est pas une image; 403; 404
 *
 * Règles imposées par la consigne, que cette suite vérifie :
 *   - un titre de tableau ou de liste fait de 1 à 60 caractères, un titre de
 *     carte de 1 à 200 (module 2), une description 10 000 au plus;
 *   - une nouvelle liste se place après les autres, une nouvelle carte en bas
 *     de sa liste;
 *   - les étiquettes sont les six couleurs ci-dessus; une échéance est une date
 *     qui existe; seuls les membres du tableau sont affectés à une carte;
 *   - un observateur lit, mais ne crée ni ne modifie rien : 403. Qui n'est pas
 *     membre reçoit 404 (décision 0001);
 *   - une carte archivée quitte le tableau; une carte supprimée n'existe plus,
 *     et perd ses pièces jointes;
 *   - seuls `image/jpeg`, `image/png`, `image/webp` et `application/pdf` sont
 *     acceptés, un fichier de plus de 10 000 000 octets est refusé, l'URL de
 *     téléversement expire dans les deux heures, une carte a dix pièces jointes
 *     au plus et une couverture au plus, qui est une image;
 *   - un tableau montre le nom de ses membres, jamais leur courriel ni leur
 *     téléphone.
 *
 * Les pièces jointes passent par votre port « stockage » : en local et dans ces
 * vérifications, un stockage simulé qui écrit sur le disque; en production,
 * Supabase Storage. Ces vérifications n'envoient aucun fichier : `attachFile`
 * n'a pas à vérifier que le fichier a bien été téléversé.
 */
import { describe, expect, it } from 'vitest'
import {
  addBoardMember,
  attachFile,
  createBoard,
  createCard,
  createList,
  createMember,
  createUploadUrl,
  getBoard,
  getCard,
  listAttachments,
  setCardStatus,
  setCover,
  updateCard,
} from '../../../src/academie/module-6'

const maxBytes = 10_000_000

async function boardOf(ownerId: string, title = 'Mariage de Mialy et Tojo') {
  const result = await createBoard({ ownerId, title })
  if (!result.boardId) throw new Error(`tableau refusé : ${result.reason ?? result.status}`)
  const read = await getBoard({ boardId: result.boardId, memberId: ownerId })
  const lists = read.board?.lists ?? []
  if (lists.length === 0) throw new Error('le tableau créé n’a aucune liste')
  return { boardId: result.boardId, listIds: lists.map((list) => list.listId) }
}

/** Un administrateur, son tableau, et une première carte dans « À faire ». */
async function cardOnBoard() {
  const ownerId = await createMember({ name: 'Mialy' })
  const { boardId, listIds } = await boardOf(ownerId)
  const created = await createCard({ listId: listIds[0] ?? '', memberId: ownerId, title: 'Réserver la salle' })
  if (!created.cardId) throw new Error(`carte refusée : ${created.reason ?? created.status}`)
  return { ownerId, boardId, listIds, cardId: created.cardId }
}

async function withRole(boardId: string, role: 'ADMIN' | 'MEMBER' | 'OBSERVER') {
  const memberId = await createMember({ name: role === 'OBSERVER' ? 'Observateur' : 'Collègue' })
  await addBoardMember({ boardId, memberId, role })
  return memberId
}

async function cardTitles(boardId: string, memberId: string) {
  const read = await getBoard({ boardId, memberId })
  return (read.board?.lists ?? []).map((list) => list.cards.map((card) => card.title))
}

async function grantFor(memberId: string, cardId: string, contentType = 'image/jpeg') {
  const grant = await createUploadUrl({ memberId, cardId, contentType, sizeBytes: 250_000 })
  if (!('key' in grant)) throw new Error(`téléversement refusé : ${grant.refused}`)
  return grant
}

async function cardWithFiles(count: number, contentType = 'image/jpeg') {
  const setup = await cardOnBoard()
  for (let index = 0; index < count; index += 1) {
    const grant = await grantFor(setup.ownerId, setup.cardId, contentType)
    const result = await attachFile({ memberId: setup.ownerId, cardId: setup.cardId, key: grant.key, name: `piece-${index + 1}` })
    if (!result.attached) throw new Error(`pièce jointe refusée : ${result.reason}`)
  }
  return setup
}

describe('la création d’un tableau', () => {
  it('crée un tableau avec trois listes, dont le créateur est administrateur', async () => {
    const ownerId = await createMember({ name: 'Mialy' })
    const result = await createBoard({ ownerId, title: 'Mariage de Mialy et Tojo' })
    expect(result.status).toBe(201)
    expect(result.boardId, 'un tableau créé porte un identifiant').toBeTruthy()

    const read = await getBoard({ boardId: result.boardId ?? '', memberId: ownerId })
    expect(read.status).toBe(200)
    expect(read.board).toMatchObject({ title: 'Mariage de Mialy et Tojo', role: 'ADMIN' })
    expect(read.board?.lists.map((list) => list.title)).toEqual(['À faire', 'En cours', 'Terminé'])
  })

  it('refuse un titre vide ou de plus de 60 caractères, avec 400', async () => {
    const ownerId = await createMember()
    expect((await createBoard({ ownerId, title: '   ' })).status).toBe(400)
    expect((await createBoard({ ownerId, title: 'a'.repeat(61) })).status).toBe(400)
  })

  it('ajoute une liste après les autres', async () => {
    const ownerId = await createMember()
    const { boardId } = await boardOf(ownerId)
    const created = await createList({ boardId, memberId: ownerId, title: 'À vérifier' })
    expect(created.status).toBe(201)

    const read = await getBoard({ boardId, memberId: ownerId })
    expect(read.board?.lists.map((list) => list.title)).toEqual(['À faire', 'En cours', 'Terminé', 'À vérifier'])
  })
})

describe('un tableau privé', () => {
  // Pour qui n'en fait pas partie, le tableau n'existe pas (décision 0001).
  it('répond 404 à qui n’est pas membre, et ne lui montre aucune carte', async () => {
    const { boardId, listIds, cardId } = await cardOnBoard()
    const stranger = await createMember()

    const read = await getBoard({ boardId, memberId: stranger })
    expect(read.status).toBe(404)
    expect(read.board, 'aucun contenu pour un non-membre').toBeUndefined()
    expect(await getCard({ cardId, memberId: stranger })).toBeNull()
    expect((await createCard({ listId: listIds[0] ?? '', memberId: stranger, title: 'Intrus' })).status).toBe(404)
    expect((await updateCard({ cardId, memberId: stranger, title: 'Détournée' })).status).toBe(404)
  })

  it('laisse un observateur lire le tableau, et lui refuse toute modification avec 403', async () => {
    const { boardId, listIds, cardId } = await cardOnBoard()
    const observer = await withRole(boardId, 'OBSERVER')

    const read = await getBoard({ boardId, memberId: observer })
    expect(read.status).toBe(200)
    expect(read.board?.role).toBe('OBSERVER')
    expect((await createCard({ listId: listIds[0] ?? '', memberId: observer, title: 'Une idée' })).status).toBe(403)
    expect((await createList({ boardId, memberId: observer, title: 'Ma liste' })).status).toBe(403)
    expect((await updateCard({ cardId, memberId: observer, title: 'Modifiée' })).status).toBe(403)
    expect((await setCardStatus({ cardId, memberId: observer, status: 'DONE' })).status).toBe(403)
  })

  it('ne montre jamais le courriel ni le téléphone d’un membre', async () => {
    const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.org`
    const ownerId = await createMember({ name: 'Voahangy', email, phone: '034 98 765 43' })
    const { boardId, listIds } = await boardOf(ownerId)
    const { cardId = '' } = await createCard({ listId: listIds[0] ?? '', memberId: ownerId, title: 'Acheter les fleurs' })
    await updateCard({ cardId, memberId: ownerId, assignees: [ownerId] })

    const text = JSON.stringify([await getBoard({ boardId, memberId: ownerId }), await getCard({ cardId, memberId: ownerId })])
    expect(text, 'le courriel d’un membre reste sur le serveur').not.toContain(email)
    expect(text, 'le téléphone d’un membre reste sur le serveur').not.toMatch(/98\s?765\s?43|987654/)
    expect((await getCard({ cardId, memberId: ownerId }))?.assignees).toEqual([{ memberId: ownerId, name: 'Voahangy' }])
  })
})

describe('les cartes', () => {
  it('ajoute chaque nouvelle carte en bas de sa liste', async () => {
    const ownerId = await createMember()
    const { boardId, listIds } = await boardOf(ownerId)
    for (const title of ['Réserver la salle', 'Choisir le traiteur', 'Envoyer les faire-part']) {
      expect((await createCard({ listId: listIds[0] ?? '', memberId: ownerId, title })).status).toBe(201)
    }
    expect((await cardTitles(boardId, ownerId))[0]).toEqual(['Réserver la salle', 'Choisir le traiteur', 'Envoyer les faire-part'])
  })

  it('laisse un membre créer et modifier une carte', async () => {
    const { boardId, listIds, cardId } = await cardOnBoard()
    const colleague = await withRole(boardId, 'MEMBER')

    expect((await createCard({ listId: listIds[1] ?? '', memberId: colleague, title: 'Louer la sono' })).status).toBe(201)
    expect((await updateCard({ cardId, memberId: colleague, description: 'Salle de 150 places à Ivandry.' })).status).toBe(200)
    expect((await getCard({ cardId, memberId: colleague }))?.description).toBe('Salle de 150 places à Ivandry.')
  })

  it('refuse un titre vide ou trop long, et une description trop longue, avec 400', async () => {
    const { ownerId, listIds, cardId } = await cardOnBoard()
    expect((await createCard({ listId: listIds[0] ?? '', memberId: ownerId, title: '  ' })).status).toBe(400)
    expect((await createCard({ listId: listIds[0] ?? '', memberId: ownerId, title: 'a'.repeat(201) })).status).toBe(400)
    expect((await updateCard({ cardId, memberId: ownerId, description: 'a'.repeat(10_001) })).status).toBe(400)
    expect((await getCard({ cardId, memberId: ownerId }))?.title).toBe('Réserver la salle')
  })

  it('range l’échéance, les étiquettes et les membres affectés', async () => {
    const { ownerId, boardId, cardId } = await cardOnBoard()
    const colleague = await withRole(boardId, 'MEMBER')

    const result = await updateCard({
      cardId,
      memberId: ownerId,
      dueOn: '2030-07-15',
      labels: ['RED', 'BLUE'],
      assignees: [colleague],
    })
    expect(result.status).toBe(200)
    const card = await getCard({ cardId, memberId: ownerId })
    expect(card?.dueOn).toBe('2030-07-15')
    expect([...(card?.labels ?? [])].sort()).toEqual(['BLUE', 'RED'])
    expect(card?.assignees.map((assignee) => assignee.memberId)).toEqual([colleague])

    expect((await updateCard({ cardId, memberId: ownerId, dueOn: null })).status).toBe(200)
    expect((await getCard({ cardId, memberId: ownerId }))?.dueOn).toBeNull()
  })

  it('refuse une date qui n’existe pas, une étiquette inconnue, ou un non-membre affecté, avec 400', async () => {
    const { ownerId, cardId } = await cardOnBoard()
    const stranger = await createMember()
    expect((await updateCard({ cardId, memberId: ownerId, dueOn: '2030-02-30' })).status).toBe(400)
    expect((await updateCard({ cardId, memberId: ownerId, dueOn: '15/07/2030' })).status).toBe(400)
    expect((await updateCard({ cardId, memberId: ownerId, labels: ['ROSE' as never] })).status).toBe(400)
    expect((await updateCard({ cardId, memberId: ownerId, assignees: [stranger] })).status).toBe(400)
  })

  // La version sert au module 8 : elle change à chaque modification.
  it('commence à la version 1, et l’augmente à chaque modification', async () => {
    const { ownerId, cardId } = await cardOnBoard()
    expect((await getCard({ cardId, memberId: ownerId }))?.version).toBe(1)
    await updateCard({ cardId, memberId: ownerId, title: 'Réserver la salle des fêtes' })
    expect((await getCard({ cardId, memberId: ownerId }))?.version).toBe(2)
    await setCardStatus({ cardId, memberId: ownerId, status: 'DONE' })
    expect((await getCard({ cardId, memberId: ownerId }))?.version).toBe(3)
  })
})

describe('le cycle de vie d’une carte', () => {
  it('garde une carte terminée sur le tableau, et retire une carte archivée', async () => {
    const { ownerId, boardId, cardId } = await cardOnBoard()
    expect((await setCardStatus({ cardId, memberId: ownerId, status: 'DONE' })).status).toBe(200)
    expect((await cardTitles(boardId, ownerId))[0]).toEqual(['Réserver la salle'])

    expect((await setCardStatus({ cardId, memberId: ownerId, status: 'ARCHIVED' })).status).toBe(200)
    expect((await cardTitles(boardId, ownerId))[0], 'une carte archivée quitte le tableau').toEqual([])
    expect((await getCard({ cardId, memberId: ownerId }))?.status, 'elle reste lisible').toBe('ARCHIVED')
  })

  it('refuse un passage interdit avec 409, comme la supprimer sans l’archiver', async () => {
    const { ownerId, cardId } = await cardOnBoard()
    expect((await setCardStatus({ cardId, memberId: ownerId, status: 'DELETED' })).status).toBe(409)
    expect((await getCard({ cardId, memberId: ownerId }))?.status).toBe('OPEN')
  })

  it('efface une carte supprimée, avec ses pièces jointes', async () => {
    const { ownerId, cardId } = await cardWithFiles(2)
    await setCardStatus({ cardId, memberId: ownerId, status: 'ARCHIVED' })

    expect((await setCardStatus({ cardId, memberId: ownerId, status: 'DELETED' })).status).toBe(200)
    expect(await getCard({ cardId, memberId: ownerId }), 'une carte supprimée n’existe plus').toBeNull()
    expect(await listAttachments({ cardId, memberId: ownerId }), 'ses pièces jointes sont effacées').toEqual([])
  })
})

describe('autorisation de téléversement', () => {
  it('accorde une URL signée à un membre, qui expire dans les deux heures', async () => {
    const { ownerId, cardId } = await cardOnBoard()
    const grant = await createUploadUrl({ memberId: ownerId, cardId, contentType: 'application/pdf', sizeBytes: 250_000 })

    expect('key' in grant, 'un PDF doit être accepté').toBe(true)
    if (!('key' in grant)) return
    expect(grant.url).toMatch(/^https?:\/\/.+/)
    const expiresAt = new Date(grant.expiresAt).getTime()
    expect(Number.isNaN(expiresAt), 'expiresAt doit être une date ISO 8601').toBe(false)
    expect(expiresAt).toBeGreaterThan(Date.now())
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 7_200_000)
  })

  // Le type est décidé côté serveur : un client peut annoncer ce qu'il veut.
  it('refuse un type de fichier non prévu, ou un fichier trop volumineux', async () => {
    const { ownerId, cardId } = await cardOnBoard()
    for (const contentType of ['text/html', 'application/x-msdownload', 'video/mp4']) {
      const grant = await createUploadUrl({ memberId: ownerId, cardId, contentType, sizeBytes: 100_000 })
      expect('refused' in grant, `${contentType} doit être refusé`).toBe(true)
    }
    const big = await createUploadUrl({ memberId: ownerId, cardId, contentType: 'image/jpeg', sizeBytes: maxBytes + 1 })
    expect('refused' in big, 'un fichier de plus de 10 Mo doit être refusé').toBe(true)
  })

  it('refuse le téléversement à un observateur et à un non-membre', async () => {
    const { boardId, cardId } = await cardOnBoard()
    const observer = await withRole(boardId, 'OBSERVER')
    const stranger = await createMember()
    for (const memberId of [observer, stranger]) {
      const grant = await createUploadUrl({ memberId, cardId, contentType: 'image/jpeg', sizeBytes: 100_000 })
      expect('refused' in grant, 'seuls les administrateurs et les membres joignent un fichier').toBe(true)
    }
  })
})

describe('les pièces jointes d’une carte', () => {
  it('conserve les pièces jointes, sans couverture au départ', async () => {
    const { ownerId, cardId } = await cardWithFiles(3)
    const files = await listAttachments({ cardId, memberId: ownerId })

    expect(files).toHaveLength(3)
    expect(files.map((file) => file.name).sort()).toEqual(['piece-1', 'piece-2', 'piece-3'])
    expect(files.filter((file) => file.isCover)).toHaveLength(0)
  })

  it('choisit une couverture parmi les images, sans en créer une seconde', async () => {
    const { ownerId, cardId } = await cardWithFiles(3)
    const [first, second] = await listAttachments({ cardId, memberId: ownerId })

    expect((await setCover({ memberId: ownerId, cardId, key: first?.key ?? '' })).status).toBe(200)
    expect((await setCover({ memberId: ownerId, cardId, key: second?.key ?? '' })).status).toBe(200)
    const after = await listAttachments({ cardId, memberId: ownerId })
    expect(after.filter((file) => file.isCover).map((file) => file.key)).toEqual([second?.key])
  })

  it('refuse un PDF en couverture, avec 400', async () => {
    const { ownerId, cardId } = await cardWithFiles(1, 'application/pdf')
    const [pdf] = await listAttachments({ cardId, memberId: ownerId })
    expect((await setCover({ memberId: ownerId, cardId, key: pdf?.key ?? '' })).status).toBe(400)
  })

  it('ne montre aucune pièce jointe à un non-membre', async () => {
    const { cardId } = await cardWithFiles(1)
    expect(await listAttachments({ cardId, memberId: await createMember() })).toEqual([])
  })

  it('refuse une onzième pièce jointe, avec un motif', { timeout: 30_000 }, async () => {
    const { ownerId, cardId } = await cardWithFiles(10)
    const grant = await createUploadUrl({ memberId: ownerId, cardId, contentType: 'image/png', sizeBytes: 250_000 })
    const result =
      'key' in grant
        ? await attachFile({ memberId: ownerId, cardId, key: grant.key, name: 'piece-11' })
        : { attached: false, reason: grant.refused }

    expect(result.attached, 'dix pièces jointes au plus').toBe(false)
    expect(result.reason, 'le refus doit porter un motif lisible').toBeTruthy()
    expect(await listAttachments({ cardId, memberId: ownerId })).toHaveLength(10)
  })

  it('refuse de reprendre la pièce jointe d’une autre carte', async () => {
    const owner = await cardWithFiles(1)
    const thief = await cardOnBoard()
    const [file] = await listAttachments({ cardId: owner.cardId, memberId: owner.ownerId })
    expect(file).toBeDefined()

    const result = await attachFile({ memberId: thief.ownerId, cardId: thief.cardId, key: file?.key ?? '', name: 'volée' })
    expect(result.attached, 'une pièce jointe déjà rattachée ne doit pas être reprise').toBe(false)
  })
})
