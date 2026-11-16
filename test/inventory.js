const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'emacs-keymapings.md');
const outputPath = path.join(root, 'docs', 'binding-inventory', 'global-snapshot.json');
const source = fs.readFileSync(sourcePath, 'utf8');
const section = source.match(/### `global-map`\s+```text\s*([\s\S]*?)```/);
if (!section) throw new Error('Global map section not found');
const rows = [];
for (const line of section[1].split(/\r?\n/)) {
  if (!line.trim() || /^Key\s+Binding\s*$/.test(line) || /^-+$/.test(line)) continue;
  const match = line.match(/^(.*?)\s+(\S+)\s*$/);
  if (!match) throw new Error(`Unrecognized global map line: ${line}`);
  const key = match[1].trim(); const command = match[2];
  const nonKeyboard = /mouse|wheel|touch|drag-n-drop|pinch|select-window|switch-frame|delete-frame|iconify-frame|make-frame-visible|language-change/i.test(key);
  const excluded = ['eval-expression', 'eval-last-sexp', 'eval-defun'].includes(command);
  rows.push({ id: `global-${crypto.createHash('sha256').update(key + '\0' + command).digest('hex').slice(0, 16)}`, key, command, context: 'global-map snapshot', platform: 'Windows batch', prefix: key.includes(' ') && !key.includes(' .. ') ? key.slice(0, key.lastIndexOf(' ')) : null, classification: nonKeyboard ? 'non-keyboard/translation' : excluded ? 'excluded' : 'unresolved', reason: nonKeyboard ? 'Non-keyboard event in snapshot' : excluded ? 'Emacs Lisp evaluation is excluded from scope' : 'Requires manual scope and context review', status: 'unreviewed', proposedCommand: null, scenarioIds: [], semanticEvidence: [], dispatchEvidence: [], deviation: null });
}
if (!rows.length || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Empty inventory or duplicate entries');
const inventory = { schemaVersion: 1, provenance: { source: 'emacs-keymapings.md global-map section', sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), emacs: '31.1_1', startup: '-Q', platform: 'Windows', display: 'batch', note: 'Provisional snapshot only; not a fresh extraction or a complete reviewed global inventory.' }, rows };
const encoded = JSON.stringify(inventory, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== encoded) throw new Error('Inventory is missing or stale; run node test/inventory.js');
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, encoded);
}
const counts = Object.fromEntries([...new Set(rows.map(row => row.classification))].map(kind => [kind, rows.filter(row => row.classification === kind).length]));
console.log(`${rows.length} snapshot entries: ${JSON.stringify(counts)}`);
if (process.argv.includes('--release') && rows.some(row => row.classification === 'unresolved' || row.status === 'unreviewed')) throw new Error('Inventory is not release-ready');
