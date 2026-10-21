import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as attendre } from 'node:timers/promises'
import { test } from 'node:test'
import { stopper } from './processus.mjs'

test(
  'SIGKILL atteint un descendant ignorant SIGTERM après la sortie du wrapper',
  {
    skip: process.platform !== 'linux',
    timeout: 10_000,
  },
  async () => {
    // Le wrapper peut disparaître pendant l'arrêt ou avant l'appel à stopper.
    for (const terminerAvant of [false, true]) {
      const dossier = mkdtempSync(join(tmpdir(), 'descendant-'))
      const temoin = join(dossier, 'activite')
      const code = `
      const { spawn } = require('node:child_process');
      const enfant = spawn(process.execPath, ['-e',
        "const fs=require('fs');let n=0;process.on('SIGTERM',()=>{});setInterval(()=>fs.writeFileSync(process.env.TEMOIN,String(++n)),10);console.log(process.pid)"
      ], { stdio: ['ignore', 'pipe', 'inherit'] });
      enfant.stdout.once('data', b => {
        console.log(String(b).trim());
        ${terminerAvant ? 'enfant.unref();enfant.stdout.destroy();process.exit(0)' : ''}
      });
    `
      const wrapper = spawn(process.execPath, ['-e', code], {
        detached: true,
        stdio: ['ignore', 'pipe', 'inherit'],
        env: { ...process.env, TEMOIN: temoin },
      })
      let pid
      try {
        const sortie = new Promise((resoudre) => wrapper.once('exit', resoudre))
        pid = Number(
          await new Promise((resoudre) => wrapper.stdout.once('data', resoudre)),
        )
        assert.ok(pid > 0)
        if (terminerAvant) await sortie
        await attendre(100)
        const avant = readFileSync(temoin, 'utf8')
        await attendre(50)
        assert.notEqual(
          readFileSync(temoin, 'utf8'),
          avant,
          'le descendant travaille avant l’arrêt',
        )
        const debut = Date.now()
        await stopper(wrapper, 'SIGTERM', true, 150)
        assert.ok(
          Date.now() - debut >= 150,
          'l’escalade reste active après la sortie du wrapper',
        )
        const apres = readFileSync(temoin, 'utf8')
        await attendre(100)
        assert.equal(
          readFileSync(temoin, 'utf8'),
          apres,
          'le descendant ne travaille plus',
        )
      } finally {
        try {
          process.kill(-wrapper.pid, 'SIGKILL')
        } catch (erreur) {
          assert.equal(erreur.code, 'ESRCH')
        }
        rmSync(dossier, { recursive: true, force: true })
      }
    }
  },
)
