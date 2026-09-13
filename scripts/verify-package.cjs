const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const provenance = JSON.parse(fs.readFileSync(path.join(root, 'provenance.json')));
const manifest = require('../package.json');
assert.equal(manifest.version, provenance.version);
if (process.argv.includes('--release')) assert.equal(provenance.dirty, false, 'Export a clean reviewed source commit before publishing');
for (const [file, hash] of Object.entries(provenance.files)) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'dist', file))).digest('hex'), hash, `Artifact hash mismatch: ${file}`);
}
assert.equal(typeof require(path.join(root, manifest.main)).createCheckout, 'function');
import(require('node:url').pathToFileURL(path.join(root, manifest.module)).href).then(module => {
  assert.equal(typeof module.createCheckout, 'function');
  assert.ok(fs.statSync(path.join(root, manifest.types)).size > 0);
  console.log('CJS, ESM, declarations and artifact hashes verified.');
}).catch(error => { console.error(error.message); process.exitCode = 1; });
