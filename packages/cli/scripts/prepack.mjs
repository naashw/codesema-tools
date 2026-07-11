// Copie LICENSE et README.md de la racine du monorepo dans le package publié :
// npm ne remonte pas au-dessus du dossier du package, sans copie le tarball part sans eux.
import { cpSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

for (const name of ['LICENSE', 'README.md']) {
  const src = fileURLToPath(new URL(`../../../${name}`, import.meta.url))
  const dest = fileURLToPath(new URL(`../${name}`, import.meta.url))
  cpSync(src, dest)
}
console.log('[prepack] LICENSE + README.md copied from repo root')
