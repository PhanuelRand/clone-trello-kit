/**
 * Module 11 : Le paiement du Premium d'un tableau.
 *
 * Un administrateur paie 15 000 Ar par Mobile Money pour passer son tableau en
 * Premium pendant trente jours : la limite de dix membres disparaît. Les jours
 * partent du paiement si le tableau n'est pas Premium, et de la fin du Premium
 * en cours s'il l'est : un administrateur qui prolonge en avance ne perd aucun
 * jour. Quand le Premium finit, les membres déjà entrés restent, mais personne
 * de plus n'entre tant que le tableau compte dix membres ou plus.
 *
 * Le prestataire de paiement est simulé : vous l'écrivez vous-même, dans votre
 * API. Il confirme les paiements et signe ses webhooks comme le ferait un vrai
 * prestataire de Mobile Money. Aucun compte chez un prestataire n'est
 * nécessaire, et aucune carte bancaire.
 *
 * Contrat attendu, exporté par `src/academie/module-11.ts` : `createMember` et
 * `setupBoard` du module 7, `invite` et `acceptInvitation` du module 9, et :
 *
 *   export function capturePayment(input: {
 *     boardId: string; memberId: string
 *     amount: number                     // en ariary
 *     phone: string                      // le numéro Mobile Money, tel que tapé
 *     idempotencyKey: string
 *     now: string                        // un instant ISO 8601
 *   }): Promise<{
 *     status: number                     // 201, ou 200 pour une clé déjà vue;
 *                                        // 400 si le montant n'est pas 15 000, ou le numéro invalide;
 *                                        // 403 si ce n'est pas un administrateur; 404 non-membre
 *     chargeId?: string
 *   }>
 *
 *   export function listCharges(boardId: string): Promise<{ chargeId: string; amount: number }[]>
 *
 *   export function premium(input: {
 *     boardId: string; now: string
 *   }): Promise<{ active: boolean; until: string | null }>   // until : instant ISO 8601
 *
 *   export function seatsLeft(input: { boardId: string; now: string }): Promise<number | null>
 *                                        // null : aucune limite, pendant le Premium
 *
 *   export function signWebhook(payload: string): string
 *   export function handleWebhook(input: {
 *     payload: string; signature: string
 *   }): Promise<{ status: number }>
 *
 * Les montants sont des entiers, en ariary, qui n'a pas de centimes. Le numéro
 * se range sous sa forme unique (module 4), et n'apparaît jamais dans la liste
 * des débits.
 *
 * `signWebhook` n'existe que pour permettre à cette suite de fabriquer une
 * signature valide. Votre serveur, lui, vérifie celle du prestataire.
 *
 * Un événement porte `{ id, type, boardId, memberId, amount, phone,
 * idempotencyKey, paidAt }`. Un événement `payment.succeeded` correctement
 * signé enregistre le débit sous sa clé d'idempotence et prolonge le Premium,
 * exactement comme `capturePayment`. Un débit déjà enregistré sous cette clé ne
 * se dédouble pas, et ne prolonge rien une seconde fois.
 */
import { describe, expect, it } from 'vitest'
import {
  acceptInvitation,
  capturePayment,
  createMember,
  handleWebhook,
  invite,
  listCharges,
  premium,
  seatsLeft,
  setupBoard,
  signWebhook,
} from '../../../src/academie/module-11'

const price = 15_000
const phone = '034 12 345 67'
const paidAt = '2030-07-01T10:00:00.000Z'

function time(instant: string | null) {
  return instant === null ? Number.NaN : new Date(instant).getTime()
}

async function adminBoard() {
  const adminId = await createMember({ name: 'Mialy' })
  const { boardId } = await setupBoard({ ownerId: adminId })
  return { adminId, boardId }
}

function pay(boardId: string, memberId: string, key: string, now = paidAt, amount = price, number = phone) {
  return capturePayment({ boardId, memberId, amount, phone: number, idempotencyKey: key, now })
}

/** Un tableau de dix membres : l'administrateur et neuf autres. */
async function fullBoard() {
  const adminId = await createMember({ name: 'Mialy' })
  const members = []
  for (let index = 0; index < 9; index += 1) members.push({ memberId: await createMember(), role: 'MEMBER' as const })
  const { boardId } = await setupBoard({ ownerId: adminId, members })
  return { adminId, boardId }
}

async function guestJoins(boardId: string, adminId: string, now: string) {
  const email = `invite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.org`
  const memberId = await createMember({ email })
  const sent = await invite({ boardId, inviterId: adminId, email, role: 'MEMBER', now })
  if (!sent.token) return { status: sent.status }
  return acceptInvitation({ token: sent.token, memberId, now })
}

describe('l’encaissement', () => {
  it('débite une fois le prix du Premium', async () => {
    const { adminId, boardId } = await adminBoard()
    const charge = await pay(boardId, adminId, `${boardId}-1`)

    expect(charge.status).toBe(201)
    expect(charge.chargeId, 'un débit porte un identifiant').toBeTruthy()
    expect(await listCharges(boardId)).toEqual([{ chargeId: charge.chargeId, amount: price }])
  })

  // Un appel réseau qui échoue ne veut pas dire que rien ne s'est passé.
  it('ne double pas le débit quand la même clé est rejouée', async () => {
    const { adminId, boardId } = await adminBoard()
    const key = `${boardId}-1`
    const first = await pay(boardId, adminId, key)
    const replay = await pay(boardId, adminId, key)

    expect(replay.status).toBe(200)
    expect(replay.chargeId).toBe(first.chargeId)
    expect(await listCharges(boardId)).toHaveLength(1)
  })

  it('ne double pas le débit sous appels simultanés', async () => {
    const { adminId, boardId } = await adminBoard()
    const key = `${boardId}-1`
    await Promise.all(Array.from({ length: 4 }, () => pay(boardId, adminId, key)))
    expect(await listCharges(boardId)).toHaveLength(1)
  })

  it('refuse un montant qui n’est pas le tarif, ou un numéro invalide, avec 400', async () => {
    const { adminId, boardId } = await adminBoard()
    expect((await pay(boardId, adminId, `${boardId}-1`, paidAt, 1_500)).status).toBe(400)
    expect((await pay(boardId, adminId, `${boardId}-2`, paidAt, price, '12 34')).status).toBe(400)
    expect(await listCharges(boardId)).toEqual([])
  })

  it('refuse le paiement à un membre avec 403, et à un non-membre avec 404', async () => {
    const colleague = await createMember()
    const { boardId } = await setupBoard({ members: [{ memberId: colleague, role: 'MEMBER' }] })
    expect((await pay(boardId, colleague, `${boardId}-1`)).status).toBe(403)
    expect((await pay(boardId, await createMember(), `${boardId}-2`)).status).toBe(404)
    expect(await listCharges(boardId)).toEqual([])
  })

  it('ne montre jamais le numéro qui a payé', async () => {
    const { adminId, boardId } = await adminBoard()
    await pay(boardId, adminId, `${boardId}-1`)
    const charges = await listCharges(boardId)
    expect(Object.keys(charges[0] ?? {}).join(' ')).not.toMatch(/phone|telephone|numero/i)
    expect(JSON.stringify(charges)).not.toMatch(/12\s?345\s?67|1234567/)
  })
})

describe('les trente jours de Premium', () => {
  it('donne trente jours à partir du paiement', async () => {
    const { adminId, boardId } = await adminBoard()
    await pay(boardId, adminId, `${boardId}-1`)

    const during = await premium({ boardId, now: '2030-07-31T09:59:00.000Z' })
    expect(during.active).toBe(true)
    expect(time(during.until)).toBe(time('2030-07-31T10:00:00.000Z'))
    expect((await premium({ boardId, now: '2030-07-31T10:01:00.000Z' })).active).toBe(false)
  })

  it('n’est pas Premium sans paiement', async () => {
    const { boardId } = await adminBoard()
    expect(await premium({ boardId, now: paidAt })).toEqual({ active: false, until: null })
  })

  // Prolonger en avance ne fait perdre aucun jour.
  it('prolonge depuis la fin du Premium en cours', async () => {
    const { adminId, boardId } = await adminBoard()
    await pay(boardId, adminId, `${boardId}-1`)
    await pay(boardId, adminId, `${boardId}-2`, '2030-07-20T08:00:00.000Z')

    const result = await premium({ boardId, now: '2030-07-20T08:00:00.000Z' })
    expect(time(result.until)).toBe(time('2030-08-30T10:00:00.000Z'))
  })

  it('repart du jour du paiement après la fin du Premium', async () => {
    const { adminId, boardId } = await adminBoard()
    await pay(boardId, adminId, `${boardId}-1`)
    await pay(boardId, adminId, `${boardId}-2`, '2030-08-10T12:00:00.000Z')

    const result = await premium({ boardId, now: '2030-08-10T12:00:00.000Z' })
    expect(time(result.until)).toBe(time('2030-09-09T12:00:00.000Z'))
  })

  it('ne prolonge pas deux fois pour un paiement rejoué', async () => {
    const { adminId, boardId } = await adminBoard()
    const key = `${boardId}-1`
    await pay(boardId, adminId, key)
    await pay(boardId, adminId, key)

    const result = await premium({ boardId, now: paidAt })
    expect(time(result.until)).toBe(time('2030-07-31T10:00:00.000Z'))
  })
})

describe('la limite de dix membres', { timeout: 30_000 }, () => {
  it('disparaît pendant le Premium : un onzième membre entre', async () => {
    const { adminId, boardId } = await fullBoard()
    const during = '2030-07-02T10:00:00.000Z'
    expect(await seatsLeft({ boardId, now: during })).toBe(0)

    await pay(boardId, adminId, `${boardId}-1`)
    expect(await seatsLeft({ boardId, now: during }), 'aucune limite pendant le Premium').toBeNull()
    expect((await guestJoins(boardId, adminId, during)).status).toBe(200)
  })

  it('revient à la fin du Premium, sans retirer personne', async () => {
    const { adminId, boardId } = await fullBoard()
    await pay(boardId, adminId, `${boardId}-1`)
    expect((await guestJoins(boardId, adminId, '2030-07-02T10:00:00.000Z')).status).toBe(200)

    const after = '2030-08-05T10:00:00.000Z'
    expect(await seatsLeft({ boardId, now: after }), 'onze membres pour dix places : zéro, jamais moins').toBe(0)
    expect((await guestJoins(boardId, adminId, after)).status, 'le douzième ne rentre plus').toBe(409)
  })
})

describe('les webhooks du prestataire', () => {
  function event(id: string, boardId: string, memberId: string, key = `${boardId}-1`) {
    return JSON.stringify({
      id,
      type: 'payment.succeeded',
      boardId,
      memberId,
      amount: price,
      phone: '+261341234567',
      idempotencyKey: key,
      paidAt,
    })
  }

  it('refuse un événement dont la signature est invalide', async () => {
    const { adminId, boardId } = await adminBoard()
    const response = await handleWebhook({ payload: event(`evt-${boardId}`, boardId, adminId), signature: 'inventee' })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
    expect(await listCharges(boardId)).toEqual([])
  })

  it('enregistre le débit et passe le tableau en Premium pour un événement correctement signé', async () => {
    const { adminId, boardId } = await adminBoard()
    const payload = event(`evt-${boardId}`, boardId, adminId)
    const response = await handleWebhook({ payload, signature: signWebhook(payload) })

    expect(response.status).toBeGreaterThanOrEqual(200)
    expect(response.status).toBeLessThan(300)
    expect(await listCharges(boardId)).toHaveLength(1)
    expect((await premium({ boardId, now: '2030-07-02T00:00:00.000Z' })).active).toBe(true)
  })

  // Un prestataire redélivre ses événements : c'est normal, pas une anomalie.
  it('absorbe la redélivrance du même événement sans second effet', async () => {
    const { adminId, boardId } = await adminBoard()
    const payload = event(`evt-${boardId}`, boardId, adminId)
    const signature = signWebhook(payload)
    await handleWebhook({ payload, signature })
    await handleWebhook({ payload, signature })

    expect(await listCharges(boardId)).toHaveLength(1)
    expect(time((await premium({ boardId, now: paidAt })).until)).toBe(time('2030-07-31T10:00:00.000Z'))
  })

  it('ne dédouble pas un paiement déjà encaissé sous la même clé', async () => {
    const { adminId, boardId } = await adminBoard()
    await pay(boardId, adminId, `${boardId}-1`)
    const payload = event(`evt-${boardId}`, boardId, adminId)
    await handleWebhook({ payload, signature: signWebhook(payload) })

    expect(await listCharges(boardId)).toHaveLength(1)
  })
})
