/**
 * Module 9 : Les invitations et les membres d'un tableau.
 *
 * Un administrateur ou un membre invite quelqu'un par son courriel, avec un
 * rôle. L'invitation porte un jeton secret, envoyé dans un lien : la personne
 * invitée l'ouvre, se connecte avec ce courriel, et rejoint le tableau. Un
 * tableau gratuit accueille dix membres au plus, administrateurs compris.
 *
 * Les acceptations simultanées ne sont pas vérifiées ici, mais au module 12.
 * C'est voulu : une implémentation qui compte puis écrit passe cette suite et
 * échoue celle-là, et c'est ce que le module 12 apprend à diagnostiquer.
 *
 * Contrat attendu, exporté par `src/academie/module-9.ts` : `createMember` et
 * `setupBoard` du module 7, et :
 *
 *   export function invite(input: {
 *     boardId: string; inviterId: string
 *     email: string; role: 'ADMIN' | 'MEMBER' | 'OBSERVER'
 *     now: string                       // un instant ISO 8601
 *   }): Promise<{
 *     status: number                    // 201; 400 courriel ou rôle invalide; 403 rôle hors
 *                                       // de portée (module 4); 404 non-membre;
 *                                       // 409 déjà membre, déjà invité, ou tableau complet
 *     invitationId?: string
 *     token?: string                    // le jeton du lien, rendu une seule fois
 *     reason?: string
 *   }>
 *
 *   export function acceptInvitation(input: { token: string; memberId: string; now: string }):
 *     Promise<{ status: number; boardId?: string; reason?: string }>
 *                                       // 200; 403 si le courriel du compte n'est pas celui invité;
 *                                       // 404 jeton inconnu; 409 plus en attente, déjà membre
 *                                       // ou tableau complet; 410 au-delà de sept jours
 *   export function declineInvitation(input: { token: string; memberId: string; now: string }):
 *     Promise<{ status: number }>       // 200; 403; 404; 409
 *   export function revokeInvitation(input: { invitationId: string; memberId: string }):
 *     Promise<{ status: number }>       // 200 pour qui l'a envoyée ou un administrateur;
 *                                       // 403 pour un autre; 404; 409 plus en attente
 *
 *   export function pendingInvitations(input: { boardId: string; memberId: string }): Promise<{
 *     status: number                    // 200; 403 observateur; 404 non-membre
 *     items: { invitationId: string; email: string; role: string }[]
 *   }>
 *
 *   export function boardMembers(input: { boardId: string; memberId: string }): Promise<{
 *     status: number                    // 200; 404 non-membre
 *     items: { memberId: string; name: string; role: string }[]
 *   }>
 *
 *   export function changeRole(input: {
 *     boardId: string; memberId: string            // celui qui agit
 *     targetId: string; role: 'ADMIN' | 'MEMBER' | 'OBSERVER'
 *   }): Promise<{ status: number }>     // 200; 403 sans être ADMIN; 404; 409 dernier administrateur
 *
 *   export function removeMember(input: {
 *     boardId: string; memberId: string; targetId: string
 *   }): Promise<{ status: number }>     // 200 : un administrateur retire, chacun peut partir;
 *                                       // 403; 404; 409 dernier administrateur
 *
 *   export function seatsLeft(input: { boardId: string; now: string }): Promise<number>
 *                                       // places restantes : 10 moins le nombre de membres
 *
 * Une invitation vaut sept jours à partir de `now`. Le courriel se compare en
 * minuscules. Un tableau garde toujours au moins un administrateur. La liste
 * des membres montre leur nom et leur rôle, jamais leur courriel.
 */
import { describe, expect, it } from 'vitest'
import {
  acceptInvitation,
  boardMembers,
  changeRole,
  createMember,
  declineInvitation,
  invite,
  pendingInvitations,
  removeMember,
  revokeInvitation,
  seatsLeft,
  setupBoard,
} from '../../../src/academie/module-9'

const now = '2030-07-10T06:00:00.000Z'

function uniqueEmail(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.org`
}

/** Un compte avec un courriel connu, pour qu'il puisse accepter son invitation. */
async function person(name: string) {
  const email = uniqueEmail(name.toLowerCase())
  return { email, memberId: await createMember({ name, email }) }
}

async function invited(boardId: string, inviterId: string, role: 'ADMIN' | 'MEMBER' | 'OBSERVER' = 'MEMBER') {
  const guest = await person('Invitee')
  const result = await invite({ boardId, inviterId, email: guest.email, role, now })
  if (!result.token || !result.invitationId) throw new Error(`invitation refusée : ${result.reason ?? result.status}`)
  return { ...guest, token: result.token, invitationId: result.invitationId }
}

async function rolesOf(boardId: string, memberId: string) {
  const result = await boardMembers({ boardId, memberId })
  return Object.fromEntries(result.items.map((item) => [item.memberId, item.role]))
}

describe('inviter puis rejoindre', () => {
  it('fait entrer la personne invitée avec le rôle prévu', async () => {
    const { boardId, ownerId } = await setupBoard()
    const guest = await person('Fanja')
    const sent = await invite({ boardId, inviterId: ownerId, email: guest.email, role: 'OBSERVER', now })
    expect(sent.status).toBe(201)

    const accepted = await acceptInvitation({ token: sent.token ?? '', memberId: guest.memberId, now })
    expect(accepted).toMatchObject({ status: 200, boardId })
    expect(await rolesOf(boardId, ownerId)).toEqual({ [ownerId]: 'ADMIN', [guest.memberId]: 'OBSERVER' })
  })

  it('compare le courriel en minuscules', async () => {
    const { boardId, ownerId } = await setupBoard()
    const guest = await person('Rado')
    const sent = await invite({ boardId, inviterId: ownerId, email: `  ${guest.email.toUpperCase()} `, role: 'MEMBER', now })
    expect((await acceptInvitation({ token: sent.token ?? '', memberId: guest.memberId, now })).status).toBe(200)
  })

  // Le lien peut circuler : seul le compte invité peut s'en servir.
  it('refuse l’invitation à un autre compte que celui invité, avec 403', async () => {
    const { boardId, ownerId } = await setupBoard()
    const guest = await invited(boardId, ownerId)
    const intruder = await person('Intrus')

    expect((await acceptInvitation({ token: guest.token, memberId: intruder.memberId, now })).status).toBe(403)
    expect(Object.keys(await rolesOf(boardId, ownerId))).not.toContain(intruder.memberId)
  })

  it('rend un jeton long et distinct de l’identifiant, et 404 pour un jeton inconnu', async () => {
    const { boardId, ownerId } = await setupBoard()
    const guest = await invited(boardId, ownerId)
    expect(guest.token.length, 'un jeton de 32 caractères au moins').toBeGreaterThanOrEqual(32)
    expect(guest.token).not.toBe(guest.invitationId)
    expect((await acceptInvitation({ token: 'jeton-invente', memberId: guest.memberId, now })).status).toBe(404)
  })

  it('accepte une invitation jusqu’au bout de ses sept jours, et répond 410 ensuite', async () => {
    const { boardId, ownerId } = await setupBoard()
    const late = await invited(boardId, ownerId)
    const inTime = await invited(boardId, ownerId)

    expect((await acceptInvitation({ token: inTime.token, memberId: inTime.memberId, now: '2030-07-17T05:59:00.000Z' })).status).toBe(200)
    expect((await acceptInvitation({ token: late.token, memberId: late.memberId, now: '2030-07-17T06:00:00.000Z' })).status).toBe(410)
  })

  it('refuse une invitation déjà acceptée, refusée ou retirée, avec 409', async () => {
    const { boardId, ownerId } = await setupBoard()
    const accepted = await invited(boardId, ownerId)
    await acceptInvitation({ token: accepted.token, memberId: accepted.memberId, now })
    expect((await acceptInvitation({ token: accepted.token, memberId: accepted.memberId, now })).status).toBe(409)

    const declined = await invited(boardId, ownerId)
    expect((await declineInvitation({ token: declined.token, memberId: declined.memberId, now })).status).toBe(200)
    expect((await acceptInvitation({ token: declined.token, memberId: declined.memberId, now })).status).toBe(409)

    const revoked = await invited(boardId, ownerId)
    expect((await revokeInvitation({ invitationId: revoked.invitationId, memberId: ownerId })).status).toBe(200)
    expect((await acceptInvitation({ token: revoked.token, memberId: revoked.memberId, now })).status).toBe(409)
  })
})

describe('qui peut inviter', () => {
  it('laisse un membre inviter un membre, et lui refuse d’inviter un administrateur avec 403', async () => {
    const colleague = await createMember()
    const { boardId } = await setupBoard({ members: [{ memberId: colleague, role: 'MEMBER' }] })

    expect((await invite({ boardId, inviterId: colleague, email: uniqueEmail('a'), role: 'MEMBER', now })).status).toBe(201)
    expect((await invite({ boardId, inviterId: colleague, email: uniqueEmail('b'), role: 'ADMIN', now })).status).toBe(403)
  })

  it('refuse l’invitation à un observateur avec 403, et à un non-membre avec 404', async () => {
    const observer = await createMember()
    const { boardId } = await setupBoard({ members: [{ memberId: observer, role: 'OBSERVER' }] })
    const stranger = await createMember()

    expect((await invite({ boardId, inviterId: observer, email: uniqueEmail('c'), role: 'OBSERVER', now })).status).toBe(403)
    expect((await invite({ boardId, inviterId: stranger, email: uniqueEmail('d'), role: 'MEMBER', now })).status).toBe(404)
  })

  it('refuse un courriel invalide ou un rôle inconnu avec 400, et un doublon avec 409', async () => {
    const { boardId, ownerId } = await setupBoard()
    expect((await invite({ boardId, inviterId: ownerId, email: 'pas-un-courriel', role: 'MEMBER', now })).status).toBe(400)
    expect((await invite({ boardId, inviterId: ownerId, email: uniqueEmail('e'), role: 'CHEF' as never, now })).status).toBe(400)

    const guest = await invited(boardId, ownerId)
    expect((await invite({ boardId, inviterId: ownerId, email: guest.email, role: 'MEMBER', now })).status, 'déjà invité').toBe(409)
    await acceptInvitation({ token: guest.token, memberId: guest.memberId, now })
    expect((await invite({ boardId, inviterId: ownerId, email: guest.email, role: 'MEMBER', now })).status, 'déjà membre').toBe(409)
  })

  it('montre les invitations en attente aux administrateurs et aux membres, pas aux observateurs', async () => {
    const observer = await createMember()
    const { boardId, ownerId } = await setupBoard({ members: [{ memberId: observer, role: 'OBSERVER' }] })
    const guest = await invited(boardId, ownerId, 'OBSERVER')

    const pending = await pendingInvitations({ boardId, memberId: ownerId })
    expect(pending.status).toBe(200)
    expect(pending.items).toEqual([{ invitationId: guest.invitationId, email: guest.email, role: 'OBSERVER' }])
    expect((await pendingInvitations({ boardId, memberId: observer })).status).toBe(403)

    await acceptInvitation({ token: guest.token, memberId: guest.memberId, now })
    expect((await pendingInvitations({ boardId, memberId: ownerId })).items).toEqual([])
  })
})

describe('dix membres au plus', () => {
  async function fullBoard() {
    const others = []
    for (let index = 0; index < 9; index += 1) others.push({ memberId: await createMember(), role: 'MEMBER' as const })
    return setupBoard({ members: others })
  }

  it('compte les places restantes', async () => {
    const colleague = await createMember()
    const { boardId } = await setupBoard({ members: [{ memberId: colleague, role: 'MEMBER' }] })
    expect(await seatsLeft({ boardId, now })).toBe(8)
  })

  it('refuse une invitation et une acceptation quand le tableau est complet, avec 409', async () => {
    const colleague = await createMember()
    const others = [{ memberId: colleague, role: 'MEMBER' as const }]
    for (let index = 0; index < 7; index += 1) others.push({ memberId: await createMember(), role: 'MEMBER' as const })
    const { boardId, ownerId } = await setupBoard({ members: others })
    const first = await invited(boardId, ownerId)
    const second = await invited(boardId, ownerId)

    expect((await acceptInvitation({ token: first.token, memberId: first.memberId, now })).status).toBe(200)
    expect(await seatsLeft({ boardId, now })).toBe(0)
    const refused = await acceptInvitation({ token: second.token, memberId: second.memberId, now })
    expect(refused.status, 'le onzième membre doit être refusé').toBe(409)
    expect(refused.reason, 'le refus doit porter un motif lisible').toBeTruthy()
    expect((await invite({ boardId, inviterId: ownerId, email: uniqueEmail('f'), role: 'MEMBER', now })).status).toBe(409)
  })

  it('ne compte jamais de places négatives', async () => {
    const { boardId } = await fullBoard()
    expect(await seatsLeft({ boardId, now })).toBe(0)
  })
})

describe('les rôles et les départs', () => {
  it('laisse un administrateur changer un rôle, et le refuse à un membre avec 403', async () => {
    const colleague = await createMember()
    const other = await createMember()
    const { boardId, ownerId } = await setupBoard({
      members: [
        { memberId: colleague, role: 'MEMBER' },
        { memberId: other, role: 'MEMBER' },
      ],
    })

    expect((await changeRole({ boardId, memberId: ownerId, targetId: colleague, role: 'OBSERVER' })).status).toBe(200)
    expect((await changeRole({ boardId, memberId: other, targetId: ownerId, role: 'MEMBER' })).status).toBe(403)
    expect((await rolesOf(boardId, ownerId))[colleague]).toBe('OBSERVER')
  })

  // Un tableau sans administrateur ne peut plus être géré par personne.
  it('refuse de rétrograder ou de laisser partir le dernier administrateur, avec 409', async () => {
    const colleague = await createMember()
    const { boardId, ownerId } = await setupBoard({ members: [{ memberId: colleague, role: 'MEMBER' }] })

    expect((await changeRole({ boardId, memberId: ownerId, targetId: ownerId, role: 'MEMBER' })).status).toBe(409)
    expect((await removeMember({ boardId, memberId: ownerId, targetId: ownerId })).status).toBe(409)

    await changeRole({ boardId, memberId: ownerId, targetId: colleague, role: 'ADMIN' })
    expect((await removeMember({ boardId, memberId: ownerId, targetId: ownerId })).status, 'il reste un administrateur').toBe(200)
  })

  it('laisse un administrateur retirer un membre, qui perd l’accès au tableau', async () => {
    const colleague = await createMember()
    const { boardId, ownerId } = await setupBoard({ members: [{ memberId: colleague, role: 'MEMBER' }] })

    expect((await removeMember({ boardId, memberId: ownerId, targetId: colleague })).status).toBe(200)
    expect((await boardMembers({ boardId, memberId: colleague })).status, 'le tableau n’existe plus pour lui').toBe(404)
  })

  it('laisse un membre partir, mais pas retirer un autre membre', async () => {
    const colleague = await createMember()
    const other = await createMember()
    const { boardId } = await setupBoard({
      members: [
        { memberId: colleague, role: 'MEMBER' },
        { memberId: other, role: 'MEMBER' },
      ],
    })

    expect((await removeMember({ boardId, memberId: colleague, targetId: other })).status).toBe(403)
    expect((await removeMember({ boardId, memberId: colleague, targetId: colleague })).status).toBe(200)
  })

  it('montre le nom et le rôle des membres, jamais leur courriel', async () => {
    const owner = await person('Voahangy')
    const { boardId } = await setupBoard({ ownerId: owner.memberId })
    const result = await boardMembers({ boardId, memberId: owner.memberId })

    expect(result.items).toEqual([{ memberId: owner.memberId, name: 'Voahangy', role: 'ADMIN' }])
    expect(JSON.stringify(result)).not.toContain(owner.email)
  })
})
