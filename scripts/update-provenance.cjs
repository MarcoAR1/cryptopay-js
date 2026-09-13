const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const provenancePath = path.join(root, 'provenance.json');
const manifest = require('../package.json');

const files = fs.readdirSync(distDir);
const fileHashes = {};

for (const file of files.sort()) {
  const filePath = path.join(distDir, file);
  if (fs.statSync(filePath).isFile()) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    fileHashes[file] = hash;
  }
}

const provenance = {
  sourceRepository: 'MarcoAR1/cryptopay-js',
  revision: 'head',
  dirty: false,
  version: manifest.version,
  files: fileHashes,
};

fs.writeFileSync(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
console.log(`Updated provenance.json with ${Object.keys(fileHashes).length} artifact hashes.`);
