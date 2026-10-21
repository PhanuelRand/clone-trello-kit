/**
 * Module 2 : Architecture, l'état d'une échéance.
 *
 * Une échéance est une date, sans heure (décision 0006). Elle se juge par
 * rapport à la date du jour à Madagascar, UTC+3, sans heure d'été : une carte
 * due le 15 juillet est « due aujourd'hui » le 15, et en retard à partir du 16
 * à minuit, heure de Madagascar, c'est-à-dire le 15 à 21 h 00 UTC.
 *
 * Contrat attendu, exporté par `src/academie/module-2.ts` :
 *
 *   export type DueState = 'NONE' | 'DONE' | 'OVERDUE' | 'TODAY' | 'TOMORROW' | 'LATER'
 *
 *   export function dueState(input: {
 *     dueOn: string | null   // 'AAAA-MM-JJ', ou null si la carte n'a pas d'échéance
 *     done: boolean          // la carte est terminée
 *     now: string            // un instant ISO 8601, par exemple '2030-07-15T06:00:00.000Z'
 *   }): DueState
 *
 *   NONE       pas d'échéance, terminée ou non
 *   DONE       une échéance, et la carte est terminée : jamais en retard
 *   OVERDUE    l'échéance est passée
 *   TODAY      l'échéance est aujourd'hui
 *   TOMORROW   l'échéance est demain
 *   LATER      l'échéance est plus loin
 *
 * Le calcul ne dépend pas du fuseau de la machine qui l'exécute.
 */
import { describe, expect, it } from 'vitest'
import { dueState } from '../../../src/academie/module-2'

// 6 h 00 UTC, c'est 9 h 00 à Antananarivo, le 15 juillet.
const morning = '2030-07-15T06:00:00.000Z'

function state(dueOn: string | null, now = morning, done = false) {
  return dueState({ dueOn, done, now })
}

describe('l’état d’une échéance', () => {
  it('distingue le retard, aujourd’hui, demain et plus tard', () => {
    expect(state('2030-07-14')).toBe('OVERDUE')
    expect(state('2030-07-15')).toBe('TODAY')
    expect(state('2030-07-16')).toBe('TOMORROW')
    expect(state('2030-07-20')).toBe('LATER')
  })

  it('dit NONE pour une carte sans échéance, terminée ou non', () => {
    expect(state(null)).toBe('NONE')
    expect(state(null, morning, true)).toBe('NONE')
  })

  // Une tâche faite n'est jamais en retard, même rendue après la date.
  it('dit DONE pour une carte terminée, même après son échéance', () => {
    expect(state('2030-07-01', morning, true)).toBe('DONE')
    expect(state('2030-07-20', morning, true)).toBe('DONE')
  })
})

describe('minuit à Madagascar', () => {
  // 20 h 59 UTC, c'est 23 h 59 à Antananarivo : encore le 15 juillet.
  it('garde une carte due aujourd’hui jusqu’à 23 h 59, heure de Madagascar', () => {
    expect(state('2030-07-15', '2030-07-15T20:59:00.000Z')).toBe('TODAY')
    expect(state('2030-07-16', '2030-07-15T20:59:00.000Z')).toBe('TOMORROW')
  })

  // 21 h 00 UTC, c'est minuit à Antananarivo : déjà le 16 juillet.
  it('la fait passer en retard à minuit, heure de Madagascar', () => {
    expect(state('2030-07-15', '2030-07-15T21:00:00.000Z')).toBe('OVERDUE')
    expect(state('2030-07-16', '2030-07-15T21:00:00.000Z')).toBe('TODAY')
    expect(state('2030-07-17', '2030-07-15T21:00:00.000Z')).toBe('TOMORROW')
  })

  it('lit un instant écrit avec un autre décalage horaire', () => {
    expect(state('2030-07-16', '2030-07-16T01:30:00+03:00')).toBe('TODAY')
  })
})

describe('le calendrier', () => {
  it('passe d’une année à l’autre', () => {
    const newYear = '2030-12-31T21:30:00.000Z' // 0 h 30 le 1er janvier 2031 à Madagascar
    expect(state('2030-12-31', newYear)).toBe('OVERDUE')
    expect(state('2031-01-01', newYear)).toBe('TODAY')
    expect(state('2031-01-02', newYear)).toBe('TOMORROW')
  })

  it('tient compte du 29 février des années bissextiles', () => {
    expect(state('2032-02-29', '2032-02-28T10:00:00.000Z')).toBe('TOMORROW')
    expect(state('2031-03-01', '2031-02-28T10:00:00.000Z')).toBe('TOMORROW')
  })
})
