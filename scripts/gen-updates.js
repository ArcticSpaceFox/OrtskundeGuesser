#!/usr/bin/env node
import { spawnSync } from 'child_process'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

function generate() {
  const out = []
  try {
    // Use spawnSync to avoid shell interpretation issues with percent signs
    const res = spawnSync('git', ['log', '--pretty=format:%h|%ad|%s', '--date=short', '-n', '200'], { encoding: 'utf8' })
    if (res.status === 0 && res.stdout) {
      const lines = res.stdout.split('\n').filter(Boolean)
      for (const line of lines) {
        const parts = line.split('|')
        if (parts.length >= 3) {
          out.push({ hash: parts[0], date: parts[1], message: parts.slice(2).join('|') })
        }
      }
    } else {
      // git failed — fallback placeholder
      out.push({ hash: 'none', date: new Date().toISOString().slice(0,10), message: 'No git history available' })
    }
  } catch (e) {
    out.push({ hash: 'none', date: new Date().toISOString().slice(0,10), message: 'No git history available' })
  }

  const target = resolve(process.cwd(), 'public', 'updates.json')
  try {
    writeFileSync(target, JSON.stringify(out, null, 2), 'utf8')
    console.log('Wrote', target)
  } catch (e) {
    console.error('Failed to write updates.json', e)
    process.exit(1)
  }
}

generate()
