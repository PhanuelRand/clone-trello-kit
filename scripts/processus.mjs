import { setTimeout as attendre } from 'node:timers/promises'

function existe(pid, groupe) {
  try {
    process.kill(groupe ? -pid : pid, 0)
  } catch (erreur) {
    if (erreur.code === 'ESRCH') return false
    throw erreur
  }
  return true
}

/** Attend aussi les descendants POSIX, même si leur wrapper a déjà terminé. */
export async function stopper(enfant, signal = 'SIGTERM', groupe = true, delai = 10_000) {
  if (!enfant?.pid) return
  const collectif = groupe && process.platform !== 'win32'
  const actif = () =>
    collectif
      ? existe(enfant.pid, true)
      : enfant.exitCode === null && enfant.signalCode === null
  if (!actif()) return
  function signaler(nom) {
    try {
      if (collectif) process.kill(-enfant.pid, nom)
      else enfant.kill(nom)
    } catch (erreur) {
      if (erreur.code !== 'ESRCH') throw erreur
    }
  }
  signaler(signal)
  const echeance = Date.now() + delai
  while (actif() && Date.now() < echeance) await attendre(25)
  if (!actif()) return
  signaler('SIGKILL')
  const fin = Date.now() + 2_000
  while (actif() && Date.now() < fin) await attendre(25)
  // SIGKILL a été livré à tout le groupe. Des zombies peuvent encore être
  // visibles jusqu’à leur collecte par PID 1, sans pouvoir exécuter de travail.
}
