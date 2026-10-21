/**
 * Module 2 : Architecture, le cycle de vie d'une carte.
 *
 * Suite de conformité écrite par l'Académie. Elle appelle VOTRE code à travers
 * le fichier traducteur du module. Ces fichiers font partie du harnais : les
 * modifier confie votre remise à un mentor.
 *
 * Contrat attendu, exporté par `src/academie/module-2.ts` :
 *
 *   export type CardStatus = 'OPEN' | 'DONE' | 'ARCHIVED' | 'DELETED'
 *
 *   export class Card {
 *     static create(input: {
 *       boardId: string
 *       listId: string
 *       title: string
 *     }): Card                    // lève si le titre est vide ou dépasse 200 caractères
 *     readonly title: string      // le titre, sans les espaces du début et de la fin
 *     readonly status: CardStatus
 *     transitionTo(next: CardStatus): void   // lève si le passage est interdit
 *   }
 *
 * Une carte naît ouverte (OPEN). On la termine (DONE), et on peut la rouvrir.
 * On l'archive (ARCHIVED) quand elle n'a plus sa place sur le tableau, et on
 * peut la restaurer : elle revient ouverte. On ne supprime (DELETED) qu'une
 * carte archivée, et rien ne sort d'une suppression (décision 0003).
 *
 *   OPEN      -> DONE, ARCHIVED
 *   DONE      -> OPEN, ARCHIVED
 *   ARCHIVED  -> OPEN, DELETED
 *   DELETED   -> rien
 *
 * Tout autre passage lève une erreur, y compris rester dans le même statut.
 */
import { describe, expect, it } from 'vitest'
import { Card } from '../../../src/academie/module-2'

const boardId = '11111111-1111-4111-8111-111111111111'
const listId = '22222222-2222-4222-8222-222222222222'

function created() {
  return Card.create({ boardId, listId, title: 'Réserver la salle des fêtes' })
}

function advanceTo(card: Card, steps: string[]) {
  for (const step of steps) card.transitionTo(step as never)
  return card
}

const ALLOWED: Record<string, string[]> = {
  OPEN: ['DONE', 'ARCHIVED'],
  DONE: ['OPEN', 'ARCHIVED'],
  ARCHIVED: ['OPEN', 'DELETED'],
  DELETED: [],
}

/** Le chemin le plus court pour amener une carte neuve à ce statut. */
const PATH_TO: Record<string, string[]> = {
  OPEN: [],
  DONE: ['DONE'],
  ARCHIVED: ['ARCHIVED'],
  DELETED: ['ARCHIVED', 'DELETED'],
}

const STATUSES = Object.keys(ALLOWED)

describe('cycle de vie d’une carte', () => {
  it('naît ouverte', () => {
    expect(created().status).toBe('OPEN')
  })

  it('se termine, puis se rouvre', () => {
    const card = advanceTo(created(), ['DONE', 'OPEN'])
    expect(card.status).toBe('OPEN')
  })

  it('s’archive, puis revient ouverte quand on la restaure', () => {
    const card = advanceTo(created(), ['DONE', 'ARCHIVED', 'OPEN'])
    expect(card.status).toBe('OPEN')
  })

  // La suppression est définitive : elle demande de passer d'abord par l'archive.
  it('refuse de supprimer une carte qui n’est pas archivée', () => {
    expect(() => created().transitionTo('DELETED' as never)).toThrow()
    expect(() => advanceTo(created(), ['DONE']).transitionTo('DELETED' as never)).toThrow()
  })

  it('refuse de terminer une carte archivée sans la restaurer', () => {
    const card = advanceTo(created(), ['ARCHIVED'])
    expect(() => card.transitionTo('DONE' as never)).toThrow()
  })

  it('ne laisse rien sortir d’une suppression', () => {
    for (const next of STATUSES) {
      const card = advanceTo(created(), ['ARCHIVED', 'DELETED'])
      expect(() => card.transitionTo(next as never), `DELETED vers ${next}`).toThrow()
    }
  })
})

describe('le tableau complet des passages', () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const allowed = ALLOWED[from]?.includes(to) ?? false
      it(`${allowed ? 'permet' : 'refuse'} ${from} vers ${to}`, () => {
        const card = advanceTo(created(), PATH_TO[from] ?? [])
        if (allowed) {
          card.transitionTo(to as never)
          expect(card.status).toBe(to)
        } else {
          expect(() => card.transitionTo(to as never)).toThrow()
          expect(card.status, 'un passage refusé ne change pas le statut').toBe(from)
        }
      })
    }
  }
})

describe('la création', () => {
  it('garde le titre sans ses espaces du début et de la fin', () => {
    const card = Card.create({ boardId, listId, title: '   Acheter les chaises  ' })
    expect(card.title).toBe('Acheter les chaises')
  })

  it('refuse un titre vide, ou fait seulement d’espaces', () => {
    expect(() => Card.create({ boardId, listId, title: '' })).toThrow()
    expect(() => Card.create({ boardId, listId, title: '    ' })).toThrow()
  })

  it('accepte 200 caractères, et refuse le 201e', () => {
    expect(Card.create({ boardId, listId, title: 'a'.repeat(200) }).title).toHaveLength(200)
    expect(() => Card.create({ boardId, listId, title: 'a'.repeat(201) })).toThrow()
  })
})
