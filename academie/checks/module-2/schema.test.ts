/**
 * Module 2 : Architecture, le schéma.
 *
 * Ces vérifications lisent votre dépôt sans exécuter de code : présence d'une
 * migration versionnée, contraintes déclarées, types des colonnes de position,
 * de version, d'échéance et d'instant.
 *
 * Contrat attendu, exporté par `src/academie/module-2.ts` :
 *
 *   export const schema: {
 *     migrationsDir: string          // ex. 'migrations', relatif à la racine
 *     tables: {
 *       member: string               // le nom RÉEL de vos tables,
 *       board: string                // quel qu'il soit
 *       boardMember: string          // qui est membre de quel tableau, avec quel rôle
 *       list: string
 *       card: string
 *     }
 *     positionColumn: string         // ex. 'cartes.position'
 *     versionColumn: string          // ex. 'cartes.version'
 *     dueColumn: string              // ex. 'cartes.echeance'
 *     instantColumns: string[]       // ex. ['cartes.creee_le', 'membres.cree_le']
 *   }
 *
 * Vous nommez vos tables et vos colonnes comme vous voulez : la suite lit ce
 * que vous déclarez ici. Elle vérifie que ces objets existent vraiment dans vos
 * migrations et qu'ils ont le bon type.
 *
 * Un membre ne figure qu'une fois dans un tableau : la table des membres d'un
 * tableau déclare une clé primaire ou une contrainte d'unicité sur le couple
 * (tableau, membre).
 *
 * Une position est un nombre à virgule, `double precision` (décision 0002). Une
 * version est un entier (décision 0008). Une échéance est une `date`, sans
 * heure. Un instant, comme le moment où une carte est créée, est un
 * `timestamptz` : il garde un point précis dans le temps, quel que soit le
 * fuseau horaire du serveur (décision 0006).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { schema } from '../../../src/academie/module-2'

function migrationsSql(): string {
  const dir = join(process.cwd(), schema.migrationsDir)
  expect(existsSync(dir), `dossier de migrations introuvable : ${schema.migrationsDir}`).toBe(
    true,
  )

  const files = readdirSync(dir).filter((name) => name.endsWith('.sql'))
  expect(files.length, `aucune migration .sql dans ${schema.migrationsDir}/`).toBeGreaterThan(
    0,
  )

  return files
    .sort()
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n')
    .toLowerCase()
}

/** Les mots qui suivent le type d'une colonne dans sa déclaration. */
const AFTER_TYPE =
  /\s+(?:not|null|default|references|check|primary|unique|generated|constraint|collate)\b|\s*$/

const CREATE_TABLE = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:[\w"]+\.)?"?(\w+)"?\s*\(/g

/** Le contenu des parenthèses de chaque `create table … (…)`, par nom de table. */
function tableBodies(sql: string) {
  const bodies: { table: string; body: string }[] = []
  for (const start of sql.matchAll(CREATE_TABLE)) {
    let depth = 1
    let index = (start.index ?? 0) + start[0].length
    const from = index
    for (; index < sql.length && depth > 0; index += 1) {
      if (sql[index] === '(') depth += 1
      if (sql[index] === ')') depth -= 1
    }
    bodies.push({ table: start[1] ?? '', body: sql.slice(from, index - 1) })
  }
  return bodies
}

/** Les définitions séparées par des virgules, hors des parenthèses. */
function definitions(body: string) {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const character of body) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (character === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += character
  }
  parts.push(current)
  return parts.map((part) => part.replace(/--[^\n]*/g, '').trim())
}

function bareName(reference: string) {
  return reference.toLowerCase().replace(/"/g, '').split('.').at(-1) ?? ''
}

/** Le type déclaré d'une colonne, par exemple « date » ou « timestamp with time zone ». */
function declaredType(sql: string, reference: string) {
  const [table, column] = reference.includes('.')
    ? (reference.toLowerCase().replace(/"/g, '').split('.').slice(-2) as [string, string])
    : [undefined, reference.toLowerCase().replace(/"/g, '')]
  expect(column.length, `référence de colonne invalide : ${reference}`).toBeGreaterThan(0)

  const bodies = tableBodies(sql)
    .filter((entry) => !table || entry.table === table)
    .map((entry) => entry.body)
  const candidates = [
    ...bodies.flatMap(definitions),
    // Une colonne ajoutée plus tard par une migration `alter table … add column`.
    ...[...sql.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([^;,]+)/g)].map((match) => match[1] ?? ''),
  ]

  for (const definition of candidates) {
    const match = new RegExp(`^"?${column}"?\\s+([\\s\\S]+)$`).exec(definition.trim())
    if (!match?.[1]) continue
    const rest = match[1].trim()
    const end = AFTER_TYPE.exec(rest)
    return rest.slice(0, end?.index ?? rest.length).trim().replace(/\s+/g, ' ')
  }
  return undefined
}

describe('migration initiale', () => {
  it('déclare les cinq tables du domaine', () => {
    const sql = migrationsSql()
    for (const [role, table] of Object.entries(schema.tables)) {
      expect(
        sql,
        `table « ${table} » (${role}) absente des migrations`,
      ).toMatch(new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?[\\w."]*${table.toLowerCase()}\\b`))
    }
  })

  it('déclare des clés primaires et des clés étrangères', () => {
    const sql = migrationsSql()
    expect(sql).toContain('primary key')
    expect(sql).toMatch(/references|foreign key/)
  })

  it('déclare des colonnes obligatoires', () => {
    expect(migrationsSql()).toContain('not null')
  })

  // Sans cette règle, le même membre pourrait figurer deux fois, avec deux rôles.
  it('ne laisse un membre figurer qu’une fois dans un tableau', () => {
    const sql = migrationsSql()
    const table = bareName(schema.tables.boardMember)
    const body = tableBodies(sql)
      .filter((entry) => entry.table === table)
      .map((entry) => entry.body)
      .join('\n')
    expect(body, `table « ${table} » introuvable dans les migrations`).not.toBe('')
    const pair = /(?:primary\s+key|unique)\s*\(\s*"?\w+"?\s*,\s*"?\w+"?\s*\)/
    const separateIndex = new RegExp(
      `create\\s+unique\\s+index\\s+(?:if\\s+not\\s+exists\\s+)?[\\w"]*\\s+on\\s+(?:[\\w"]+\\.)?"?${table}"?\\s*(?:using\\s+\\w+\\s*)?\\(\\s*"?\\w+"?\\s*,\\s*"?\\w+"?\\s*\\)`,
    )
    expect(
      pair.test(body) || separateIndex.test(sql),
      `la table « ${table} » doit déclarer primary key (tableau, membre) ou unique (tableau, membre)`,
    ).toBe(true)
  })
})

describe('l’ordre et la version des cartes', () => {
  it('range la position dans un nombre à virgule, double precision', () => {
    const type = declaredType(migrationsSql(), schema.positionColumn)
    expect(type, `colonne « ${schema.positionColumn} » introuvable dans les migrations`).toBeDefined()
    expect(
      /^(double precision|float8|float)$/.test(type ?? ''),
      `la position doit être un double precision, pas ${type} : on la coupe en deux à chaque déplacement`,
    ).toBe(true)
  })

  it('range la version dans une colonne entière', () => {
    const type = declaredType(migrationsSql(), schema.versionColumn)
    expect(type, `colonne « ${schema.versionColumn} » introuvable dans les migrations`).toBeDefined()
    expect(
      /^(integer|int|int4|bigint|int8)$/.test(type ?? ''),
      `la version doit être un integer ou un bigint, pas ${type}`,
    ).toBe(true)
  })
})

describe('les dates et les instants', () => {
  it('range l’échéance dans une colonne de type date', () => {
    const type = declaredType(migrationsSql(), schema.dueColumn)
    expect(type, `colonne « ${schema.dueColumn} » introuvable dans les migrations`).toBeDefined()
    expect(type, `l’échéance doit être de type date, pas ${type}`).toBe('date')
  })

  it('déclare au moins une colonne d’instant', () => {
    expect(
      schema.instantColumns.length,
      'déclarez vos colonnes d’instant dans schema.instantColumns',
    ).toBeGreaterThan(0)
  })

  it('range les instants en timestamptz, jamais sans fuseau', () => {
    const sql = migrationsSql()
    for (const reference of schema.instantColumns) {
      const type = declaredType(sql, reference)
      expect(type, `colonne « ${reference} » introuvable dans les migrations`).toBeDefined()
      expect(
        /^(timestamptz|timestamp with time zone)$/.test(type ?? ''),
        `la colonne « ${reference} » doit être un timestamptz, pas ${type}`,
      ).toBe(true)
    }
  })
})
