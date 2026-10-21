// PostgreSQL et l'application appartiennent à un seul étudiant, jamais à la plateforme.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as attendre } from 'node:timers/promises'
import { stopper } from './processus.mjs'

const racine = fileURLToPath(new URL('../', import.meta.url))
process.chdir(racine)
const environnement = { ...process.env, SERVE_WEB: '1', NODE_ENV: 'production' }
const local = process.env.LOCAL_DATABASE === '1' || !process.env.DATABASE_URL
const dossier = resolve(process.env.DATA_DIR ?? join(racine, '.data'))
const kit = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8'))
let postgres
let application
let migration
let arret = false

function executer(commande, arguments_, options = {}) {
  const resultat = spawnSync(commande, arguments_, {
    env: environnement,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    ...options,
  })
  if (resultat.error || resultat.status !== 0) {
    // Ne pas afficher arguments/env : ils peuvent contenir des identifiants.
    const detail = (resultat.stderr ?? '').replace(/[a-f0-9]{48}/g, '[masqué]')
    throw new Error(`Échec de ${commande.split('/').pop()}. ${detail}`)
  }
  return resultat.stdout.trim()
}

function lancer(commande, arguments_) {
  const enfant = spawn(commande, arguments_, {
    env: environnement,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  })
  enfant.on('error', (erreur) => {
    console.error(`Impossible de démarrer le processus : ${erreur.message}`)
    void terminer(1)
  })
  return enfant
}

async function terminer(code) {
  if (arret) return
  arret = true
  await stopper(migration)
  await stopper(application)
  // Arrêt rapide mais propre : les transactions ouvertes sont annulées.
  await stopper(postgres, 'SIGINT', false)
  process.exit(code)
}
process.on('SIGTERM', () => void terminer(0))
process.on('SIGINT', () => void terminer(0))

try {
  if (!existsSync(join(racine, 'web/dist/index.html'))) {
    throw new Error('Interface absente : lancez npm run build avant npm start.')
  }
  if (local) {
    if (process.getuid?.() === 0) {
      throw new Error(
        'PostgreSQL refuse root. Lancez npm start avec un utilisateur non privilégié (voir DEPLOIEMENT.md).',
      )
    }
    let bin = process.env.PG_BIN
    if (!bin) {
      const configuration = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' })
      if (configuration.status === 0) bin = configuration.stdout.trim()
      else if (existsSync('/usr/lib/postgresql')) {
        const version = readdirSync('/usr/lib/postgresql').sort(
          (a, b) => Number(b) - Number(a),
        )[0]
        if (version) bin = `/usr/lib/postgresql/${version}/bin`
      }
    }
    if (!bin || !existsSync(join(bin, 'initdb'))) {
      throw new Error(
        'PostgreSQL absent. Installez-le ou définissez PG_BIN (voir DEPLOIEMENT.md).',
      )
    }
    mkdirSync(dossier, { recursive: true, mode: 0o700 })
    const fichierSecrets = join(dossier, 'connexion.json')
    const donnees = join(dossier, 'postgres')
    if (!existsSync(fichierSecrets)) {
      if (existsSync(join(donnees, 'PG_VERSION')))
        throw new Error(
          'connexion.json manque pour une base existante; restaurez la sauvegarde complète.',
        )
      writeFileSync(
        fichierSecrets,
        JSON.stringify({
          administrateur: randomBytes(24).toString('hex'),
          application: randomBytes(24).toString('hex'),
        }),
        { mode: 0o600, flag: 'wx' },
      )
    }
    const secrets = JSON.parse(readFileSync(fichierSecrets, 'utf8'))
    if (
      !/^[a-f0-9]{48}$/.test(secrets.administrateur) ||
      !/^[a-f0-9]{48}$/.test(secrets.application)
    ) {
      throw new Error('Fichier de connexion locale invalide.')
    }
    const port = Number(process.env.LOCAL_PG_PORT ?? 54329)
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new Error('LOCAL_PG_PORT invalide.')
    environnement.PGHOST = '127.0.0.1'
    environnement.PGPORT = String(port)
    environnement.PGUSER = 'postgres'
    environnement.PGPASSWORD = secrets.administrateur
    environnement.PGDATABASE = 'postgres'
    if (!existsSync(join(donnees, 'PG_VERSION'))) {
      const motDePasse = join(dossier, 'init-password')
      writeFileSync(motDePasse, secrets.administrateur, { mode: 0o600 })
      try {
        executer(join(bin, 'initdb'), [
          '-D',
          donnees,
          '-U',
          'postgres',
          '--encoding=UTF8',
          '--locale=C',
          '--auth=scram-sha-256',
          `--pwfile=${motDePasse}`,
        ])
      } finally {
        const { unlinkSync } = await import('node:fs')
        unlinkSync(motDePasse)
      }
    }
    postgres = lancer(join(bin, 'postgres'), [
      '-D',
      donnees,
      '-c',
      'listen_addresses=127.0.0.1',
      '-c',
      `port=${port}`,
      '-c',
      'unix_socket_directories=',
      '-c',
      'shared_buffers=128MB',
      '-c',
      'max_connections=20',
      '-c',
      'max_wal_size=256MB',
    ])
    let pret = false
    for (let essai = 0; essai < 120; essai++) {
      if (postgres.exitCode !== null || postgres.signalCode !== null)
        throw new Error('PostgreSQL s’est arrêté avant de devenir prêt.')
      const resultat = spawnSync(join(bin, 'pg_isready'), {
        env: environnement,
        stdio: 'ignore',
      })
      if (resultat.status === 0) {
        pret = true
        break
      }
      await attendre(250)
    }
    if (!pret) throw new Error('PostgreSQL ne répond pas après 30 secondes.')
    const sql = (requete, base = 'postgres') =>
      executer(join(bin, 'psql'), ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-d', base], {
        input: requete,
      })
    if (sql("SELECT 1 FROM pg_roles WHERE rolname = 'academie'") !== '1') {
      sql(`CREATE ROLE academie LOGIN PASSWORD '${secrets.application}'`)
    }
    for (const base of ['projet', 'verification']) {
      if (sql(`SELECT 1 FROM pg_database WHERE datname = '${base}'`) !== '1') {
        executer(join(bin, 'createdb'), ['--owner=academie', base])
      }
      if (kit.academieHosting?.postgis)
        sql('CREATE EXTENSION IF NOT EXISTS postgis', base)
    }
    environnement.DATABASE_URL = `postgres://academie:${secrets.application}@127.0.0.1:${port}/projet`
    environnement.DATABASE_URL_VERIFICATION = `postgres://academie:${secrets.application}@127.0.0.1:${port}/verification`
    // Ne pas transmettre le compte administrateur au serveur ou aux migrations.
    delete environnement.PGPASSWORD
    delete environnement.PGUSER
    delete environnement.PGDATABASE
    console.log('PostgreSQL local prêt; bases projet et verification distinctes.')
    postgres.once('exit', () => {
      if (!arret) void terminer(1)
    })
  }
  if (kit.scripts?.migrate) {
    // Sous Windows, npm est un script npm.cmd que spawn ne trouve pas sans
    // shell : on relance npm par Node, avec le chemin que npm fournit lui-même.
    const npm = process.env.npm_execpath
    migration = npm
      ? lancer(process.execPath, [npm, 'run', 'migrate'])
      : lancer('npm', ['run', 'migrate'])
    const code = await new Promise((resoudre) => migration.once('exit', resoudre))
    if (code !== 0) throw new Error('Migration échouée; le serveur ne sera pas démarré.')
  }
  application = lancer(process.execPath, ['--import', 'tsx', 'src/serveur.ts'])
  application.once('exit', (code) => {
    if (!arret) void terminer(code ?? 1)
  })
} catch (erreur) {
  console.error(erreur.message)
  await terminer(1)
}
