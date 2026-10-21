import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as attendre } from 'node:timers/promises'

async function portLibre() {
  const serveur = createServer()
  await new Promise((resoudre) => serveur.listen(0, '127.0.0.1', resoudre))
  const port = serveur.address().port
  await new Promise((resoudre) => serveur.close(resoudre))
  return port
}

test(
  'PostgreSQL local : compte limité, PostGIS, bases distinctes et reprise',
  {
    skip: process.env.SKIP_POSTGRES === '1',
    timeout: 120_000,
  },
  async () => {
    const dossier = mkdtempSync(join(tmpdir(), 'kit-postgres-'))
    const port = await portLibre()
    const pgPort = await portLibre()
    let enfant
    let logs = ''
    const configuration = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' })
    assert.equal(configuration.status, 0, 'PostgreSQL doit être installé')
    const bin = process.env.PG_BIN ?? configuration.stdout.trim()
    const kit = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    )
    const env = {
      ...process.env,
      LOCAL_DATABASE: '1',
      DATA_DIR: dossier,
      PORT: String(port),
      LOCAL_PG_PORT: String(pgPort),
      PG_BIN: bin,
    }
    async function demarrer() {
      logs = ''
      enfant = spawn(
        process.execPath,
        ['--env-file-if-exists=.env', 'scripts/demarrer.mjs'],
        {
          cwd: new URL('../', import.meta.url),
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
      enfant.stdout.on('data', (texte) => {
        logs += texte
      })
      enfant.stderr.on('data', (texte) => {
        logs += texte
      })
      for (let essai = 0; essai < 240; essai++) {
        assert.equal(enfant.exitCode, null, `Le démarrage échoue : ${logs}`)
        try {
          const reponse = await fetch(`http://127.0.0.1:${port}/api/health`, {
            signal: AbortSignal.timeout(500),
          })
          if (reponse.ok) return
        } catch {
          /* serveur pas encore prêt */
        }
        await attendre(250)
      }
      assert.fail(`Démarrage trop lent : ${logs}`)
    }
    async function arreter() {
      if (!enfant || enfant.exitCode !== null || enfant.signalCode !== null) return
      const sortie = new Promise((resoudre) => enfant.once('exit', resoudre))
      enfant.kill('SIGTERM')
      await sortie
    }
    function sql(requete, base = 'projet') {
      const secrets = JSON.parse(readFileSync(join(dossier, 'connexion.json'), 'utf8'))
      const resultat = spawnSync(
        join(bin, 'psql'),
        ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-d', base],
        {
          env: {
            ...env,
            PGHOST: '127.0.0.1',
            PGPORT: String(pgPort),
            PGUSER: 'academie',
            PGPASSWORD: secrets.application,
          },
          input: requete,
          encoding: 'utf8',
        },
      )
      assert.equal(resultat.status, 0, resultat.stderr)
      return resultat.stdout.trim()
    }
    try {
      await demarrer()
      assert.equal(sql('SELECT rolsuper FROM pg_roles WHERE rolname = current_user'), 'f')
      assert.equal(sql('SELECT current_database()', 'verification'), 'verification')
      if (kit.academieHosting.postgis)
        assert.match(sql('SELECT PostGIS_Version()'), /^\d/)
      sql(
        "CREATE TABLE preuve_reprise (valeur text); INSERT INTO preuve_reprise VALUES ('conservee')",
      )
      assert.equal(
        sql("SELECT to_regclass('preuve_reprise') IS NULL", 'verification'),
        't',
      )
      const html = await fetch(`http://127.0.0.1:${port}/page-profonde`, {
        headers: { accept: 'text/html' },
      })
      assert.equal(html.status, 200)
      await arreter()
      await demarrer()
      assert.equal(sql('SELECT valeur FROM preuve_reprise'), 'conservee')
      await arreter()
      assert.equal(enfant.exitCode, 0)
    } finally {
      await arreter()
      rmSync(dossier, { recursive: true, force: true })
    }
  },
)

test(
  'mode externe : un seul serveur HTTP, sans PostgreSQL local',
  { timeout: 15_000 },
  async () => {
    const port = await portLibre()
    const enfant = spawn(process.execPath, ['scripts/demarrer.mjs'], {
      cwd: new URL('../', import.meta.url),
      env: {
        ...process.env,
        LOCAL_DATABASE: '0',
        DATABASE_URL: 'postgres://inutilise@127.0.0.1:1/inutilise',
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let logs = ''
    enfant.stdout.on('data', (texte) => {
      logs += texte
    })
    enfant.stderr.on('data', (texte) => {
      logs += texte
    })
    try {
      let pret = false
      for (let essai = 0; essai < 40; essai++) {
        assert.equal(enfant.exitCode, null, logs)
        try {
          const reponse = await fetch(`http://127.0.0.1:${port}/api/health`, {
            signal: AbortSignal.timeout(500),
          })
          if (reponse.ok) {
            pret = true
            break
          }
        } catch {
          /* démarrage en cours */
        }
        await attendre(100)
      }
      assert.ok(pret, logs)
      const page = await fetch(`http://127.0.0.1:${port}/`)
      assert.equal(page.status, 200)
      assert.match(await page.text(), /<div id="root">/)
      assert.ok(!logs.includes('PostgreSQL local prêt'))
    } finally {
      if (enfant.exitCode === null && enfant.signalCode === null) {
        const sortie = new Promise((resoudre) => enfant.once('exit', resoudre))
        enfant.kill('SIGTERM')
        await sortie
      }
    }
    assert.equal(enfant.exitCode, 0)
    await assert.rejects(
      fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) }),
    )
  },
)
