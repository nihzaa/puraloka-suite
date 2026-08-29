import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8').replace(/^﻿/,'')
  .split(/\r?\n/).filter(b=>b.includes('=')&&!b.trimStart().startsWith('#'))
  .map(b=>{const i=b.indexOf('=');return [b.slice(0,i).trim(),b.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY)
const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 })
if (error) { console.error(error.message); process.exit(1) }
const sasaran = data.users.filter(u => /regrole\.uji/.test(u.email ?? ''))
console.log(`akun GoTrue uji: ${sasaran.length}`)
for (const u of sasaran) {
  const { error: e } = await sb.auth.admin.deleteUser(u.id)
  console.log(`   ${e ? 'GAGAL' : 'dihapus'} ${u.email}`)
}
