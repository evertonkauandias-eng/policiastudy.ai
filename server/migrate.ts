import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { normalizeDatabaseUrl } from './database'

const { Pool } = pg
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.')

const pool = new Pool({ connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL) })
const migrationsDir = path.resolve(process.cwd(), 'server/migrations')

const files = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort()
for (const file of files) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
  await pool.query(sql)
  console.log(`Migration aplicada: ${file}`)
}

await pool.end()
