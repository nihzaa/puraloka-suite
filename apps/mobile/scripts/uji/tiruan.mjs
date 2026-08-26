const PETA = {
  'expo-file-system': `
    export const documentDirectory = '/tmp/doc/';
    export async function makeDirectoryAsync(){}
    export async function copyAsync({from,to}){ globalThis.__salin=(globalThis.__salin||[]); globalThis.__salin.push([from,to]); }
    export async function deleteAsync(){ globalThis.__hapus=(globalThis.__hapus||0)+1; }`,
}
export async function resolve(spec, ctx, next) {
  if (PETA[spec]) return { url: 'tiruan:' + spec, shortCircuit: true }
  if (spec === './api' || spec === './api.js') return { url: 'tiruan:api', shortCircuit: true }
  if (spec === './storage' || spec === './storage.js') return { url: 'tiruan:storage', shortCircuit: true }
  return next(spec, ctx)
}
export async function load(url, ctx, next) {
  if (url.startsWith('tiruan:')) {
    const nama = url.slice(7)
    let src = PETA[nama]
    if (nama === 'api') src = `export const api = { post: async (...a) => { if (globalThis.__jawab) return globalThis.__jawab(...a); return {data:{}} } };`
    if (nama === 'storage') src = `
      globalThis.__mem = globalThis.__mem || {};
      export const storage = {
        get: async k => globalThis.__mem[k] ?? null,
        set: async (k,v) => { globalThis.__mem[k]=v },
        remove: async k => { delete globalThis.__mem[k] },
      };`
    return { format: 'module', source: src, shortCircuit: true }
  }
  return next(url, ctx)
}
