/**
 * Des dates pour les suites qui comptent en jours de Madagascar.
 *
 * Certaines suites ont besoin de la vraie date du jour à Madagascar : une
 * échéance « aujourd'hui » ou « en retard » se juge par rapport à elle. Les
 * autres passent un instant fixe, en 2030, pour que minuit se vérifie sans
 * attendre minuit.
 *
 * Ce fichier fait partie du harnais.
 */

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function format(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`
}

function parts(date: string) {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  return { year, month, day }
}

/** La date du jour à Madagascar, 'AAAA-MM-JJ'. */
export function todayInMadagascar() {
  // 'en-CA' écrit les dates au format AAAA-MM-JJ.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Antananarivo' }).format(new Date())
}

/** La date `days` jours plus tard, ou plus tôt si `days` est négatif. */
export function shiftDays(date: string, days: number) {
  const { year, month, day } = parts(date)
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * 86_400_000)
  return format(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}
