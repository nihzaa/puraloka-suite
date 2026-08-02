import pg from 'pg'; import fs from 'fs';
const url=/DIRECT_URL=(.+)/.exec(fs.readFileSync('.env','utf8'))[1].trim().replace(/^["']|["']$/g,'');
const c=new pg.Client({connectionString:url}); await c.connect();
await c.query(fs.readFileSync('../../db/migrations/169_gl_void_boleh_punya_posted_at.sql','utf8'));
console.log('applied: 169');
await c.end();
