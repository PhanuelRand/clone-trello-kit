/**
 * Module 4 : Mots de passe, comptes et droits.
 *
 * Contrat attendu, exporté par `src/academie/module-4.ts`, à côté de
 * `normalizePhone` :
 *
 *   export class Member {
 *     static register(input: {
 *       email: string; name: string
 *       phone?: string           // facultatif; tel que le membre l'a tapé
 *     }): Member                 // lève si le courriel, le nom ou le numéro n'est pas valide
 *     readonly email: string     // en minuscules, sans espaces autour
 *     readonly name: string      // sans espaces autour
 *     readonly phone: string | null   // la forme unique, '+261…', ou null
 *   }
 *
 *   export function hashPassword(plain: string): Promise<string>
 *   export function verifyPassword(plain: string, hash: string): Promise<boolean>
 *
 *   export type BoardRole = 'ADMIN' | 'MEMBER' | 'OBSERVER'
 *   export type Action =
 *     'CREATE_BOARD' | 'VIEW_BOARD' | 'COMMENT' | 'EDIT_CARDS' | 'INVITE' | 'MANAGE_BOARD'
 *
 *   export function authorize(input: {
 *     signedIn: boolean                  // false pour un visiteur non connecté
 *     boardRole?: BoardRole | null       // le rôle sur le tableau concerné; null : pas membre
 *     action: Action
 *   }): { allowed: boolean; status: number }
 *
 *   export function assignableRoles(role: BoardRole | null): BoardRole[]
 *
 * Les droits sur un tableau (décision 0001) :
 *
 *   VIEW_BOARD, COMMENT     ADMIN, MEMBER, OBSERVER
 *   EDIT_CARDS, INVITE      ADMIN, MEMBER
 *   MANAGE_BOARD            ADMIN        (rôles, retrait d'un membre, Premium, règles)
 *   CREATE_BOARD            tout compte connecté, sans rôle préalable
 *
 * Un visiteur non connecté reçoit 401. Un compte qui n'est pas membre du
 * tableau reçoit 404 : le tableau n'existe pas pour lui. Un membre qui n'a pas
 * le droit de l'action reçoit 403.
 *
 * `assignableRoles` dit quels rôles un membre peut donner en invitant : un
 * administrateur donne les trois, un membre donne MEMBER ou OBSERVER, un
 * observateur ou un non-membre n'en donne aucun.
 *
 * `authorize` est la décision d'autorisation de votre serveur, isolée pour être
 * testable. Vos routes doivent l'appeler : masquer un bouton dans l'interface
 * n'est pas une autorisation.
 */
import { describe, expect, it } from 'vitest'
import {
  Member,
  assignableRoles,
  authorize,
  hashPassword,
  verifyPassword,
} from '../../../src/academie/module-4'

const BOARD_ACTIONS = ['VIEW_BOARD', 'COMMENT', 'EDIT_CARDS', 'INVITE', 'MANAGE_BOARD'] as const
const ALL_ACTIONS = ['CREATE_BOARD', ...BOARD_ACTIONS] as const

const EXPECTED: Record<string, Record<(typeof BOARD_ACTIONS)[number], boolean>> = {
  ADMIN: { VIEW_BOARD: true, COMMENT: true, EDIT_CARDS: true, INVITE: true, MANAGE_BOARD: true },
  MEMBER: { VIEW_BOARD: true, COMMENT: true, EDIT_CARDS: true, INVITE: true, MANAGE_BOARD: false },
  OBSERVER: { VIEW_BOARD: true, COMMENT: true, EDIT_CARDS: false, INVITE: false, MANAGE_BOARD: false },
}

describe('l’inscription d’un membre', () => {
  it('range le courriel en minuscules, et le nom sans espaces autour', () => {
    const member = Member.register({ email: '  Voahangy@Example.ORG ', name: ' Voahangy ' })
    expect(member.email).toBe('voahangy@example.org')
    expect(member.name).toBe('Voahangy')
  })

  it('range le numéro sous sa forme unique, ou rien', () => {
    const withPhone = Member.register({ email: 'tojo@example.org', name: 'Tojo', phone: '034 12 345 67' })
    expect(withPhone.phone).toBe('+261341234567')
    expect(Member.register({ email: 'mialy@example.org', name: 'Mialy' }).phone).toBeNull()
  })

  it('refuse un courriel sans arobase, un nom vide ou un numéro invalide', () => {
    expect(() => Member.register({ email: 'hery.example.org', name: 'Hery' })).toThrow()
    expect(() => Member.register({ email: 'hery@example.org', name: '   ' })).toThrow()
    expect(() => Member.register({ email: 'hery@example.org', name: 'Hery', phone: '12345' })).toThrow()
  })
})

describe('stockage des mots de passe', () => {
  it('ne conserve jamais le mot de passe en clair', async () => {
    const hash = await hashPassword('mot-de-passe-de-test-1')
    expect(hash).not.toContain('mot-de-passe-de-test-1')
    expect(hash.length).toBeGreaterThan(20)
  })

  // Un hachage sans sel se casse avec une table pré-calculée.
  it('sale le hachage : deux hachages du même mot de passe diffèrent', async () => {
    const [first, second] = await Promise.all([
      hashPassword('mot-de-passe-de-test-1'),
      hashPassword('mot-de-passe-de-test-1'),
    ])
    expect(first).not.toBe(second)
  })

  it('reconnaît le bon mot de passe et rejette le mauvais', async () => {
    const hash = await hashPassword('mot-de-passe-de-test-1')
    expect(await verifyPassword('mot-de-passe-de-test-1', hash)).toBe(true)
    expect(await verifyPassword('mot-de-passe-de-test-2', hash)).toBe(false)
  })
})

describe('autorisation côté serveur', () => {
  it('refuse un visiteur anonyme avec 401, quel que soit le rôle annoncé', () => {
    for (const action of ALL_ACTIONS) {
      const decision = authorize({ signedIn: false, boardRole: 'ADMIN', action })
      expect(decision.allowed, `un visiteur ne doit pas pouvoir ${action}`).toBe(false)
      expect(decision.status).toBe(401)
    }
  })

  it('laisse tout compte connecté créer un tableau', () => {
    expect(authorize({ signedIn: true, boardRole: null, action: 'CREATE_BOARD' }).allowed).toBe(true)
  })

  // Le cœur du module : pour qui n'est pas membre, le tableau n'existe pas.
  it('répond 404 à un compte qui n’est pas membre du tableau', () => {
    for (const action of BOARD_ACTIONS) {
      for (const boardRole of [null, undefined]) {
        const decision = authorize({ signedIn: true, boardRole, action })
        expect(decision.allowed, `un non-membre ne doit pas pouvoir ${action}`).toBe(false)
        expect(decision.status, `${action} sans rôle : 404, pas 403`).toBe(404)
      }
    }
  })

  for (const role of ['ADMIN', 'MEMBER', 'OBSERVER'] as const) {
    it(`applique les droits du rôle ${role}, et répond 403 au-delà`, () => {
      for (const action of BOARD_ACTIONS) {
        const decision = authorize({ signedIn: true, boardRole: role, action })
        const expected = EXPECTED[role]?.[action]
        expect(decision.allowed, `${role} et ${action}`).toBe(expected)
        if (!expected) expect(decision.status, `${role} et ${action}`).toBe(403)
      }
    })
  }
})

describe('les rôles qu’on peut donner en invitant', () => {
  it('laisse un administrateur donner les trois rôles', () => {
    expect([...assignableRoles('ADMIN')].sort()).toEqual(['ADMIN', 'MEMBER', 'OBSERVER'])
  })

  it('laisse un membre inviter un membre ou un observateur, jamais un administrateur', () => {
    expect([...assignableRoles('MEMBER')].sort()).toEqual(['MEMBER', 'OBSERVER'])
  })

  it('ne laisse rien donner à un observateur ni à un non-membre', () => {
    expect(assignableRoles('OBSERVER')).toEqual([])
    expect(assignableRoles(null)).toEqual([])
  })
})
