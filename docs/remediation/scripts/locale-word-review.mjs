// Reproducible offline corpus review; no plugin, credentials or external translation upload.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { translations } from '../../../js/translations.js';
const [output] = process.argv.slice(2);
assert.ok(output?.endsWith('.html') && !fs.existsSync(output), 'Fresh review output required');
const locales = ['az', 'ru', 'en'];
const source = fs.readFileSync('js/translations.js', 'utf8');
const tree = ts.createSourceFile('translations.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const duplicates = [];
function inspect(node) {
  if (ts.isObjectLiteralExpression(node)) {
    const keys = new Set();
    for (const property of node.properties) {
      if (!property.name) continue;
      const name = property.name.text ?? property.name.getText(tree);
      if (keys.has(name)) duplicates.push(name);
      keys.add(name);
    }
  }
  ts.forEachChild(node, inspect);
}
inspect(tree); assert.deepEqual(duplicates, []);
const keys = [...new Set(locales.flatMap(lang => Object.keys(translations[lang])))].sort();
const files = ['index.html', 'delete-account.html', 'js/accountDeletionPage.js', ...fs.readdirSync('js').filter(n => n.endsWith('.js')).map(n => 'js/' + n)];
const references = new Set();
for (const file of new Set(files)) {
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/\bdata-(?:deletion-)?i18n(?:-(?:aria(?:-label)?|title|placeholder))?=['"]([^'"]+)['"]/g)) references.add(match[1]);
  if (file.endsWith('.js')) {
    const syntax = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const collect = node => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '';
        if (['t', 'format'].includes(name) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) references.add(node.arguments[0].text);
      }
      ts.forEachChild(node, collect);
    };
    collect(syntax);
  }
}
const missing = [], placeholderErrors = [];
const placeholders = text => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort();
for (const key of references) for (const lang of locales) if (!translations[lang]?.[key]) missing.push({ key, lang });
for (const key of keys) {
  const values = locales.map(lang => translations[lang][key]);
  if (values.every(v => typeof v === 'string')) {
    const expected = placeholders(values[0]);
    for (let i = 1; i < values.length; i++) if (JSON.stringify(placeholders(values[i])) !== JSON.stringify(expected)) placeholderErrors.push({ key, lang: locales[i] });
  }
}
assert.deepEqual(missing, []); assert.deepEqual(placeholderErrors, []);
const escape = text => String(text ?? '—').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hash = createHash('sha256').update(source).digest('hex');
const rows = keys.map(key => `<tr><td><code>${escape(key)}</code></td>${locales.map(lang => `<td lang="${lang}">${escape(translations[lang][key])}</td>`).join('')}</tr>`).join('\n');
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Domino — проверка переводов v2</title><style>body{font:16px/1.5 system-ui;margin:20px;color:#192130}input{font:inherit;padding:10px;width:min(90%,600px)}table{border-collapse:collapse;width:100%}th{position:sticky;top:0;background:#e5edf8}td,th{border:1px solid #ccd3de;padding:10px;vertical-align:top}td:first-child{font-size:12px;max-width:250px;overflow-wrap:anywhere}tr:nth-child(even){background:#f5f7fa}code{overflow-wrap:anywhere}</style></head><body><h1>Переводы Domino — проверка владельцем</h1><p>Актуальные AZ / RU / EN после исправлений S054. Можно искать слово или ключ. Знак — означает отсутствие отдельного неиспользуемого/вариантного ключа; все найденные статические ссылки проверены. Финальная проверка владельцем и турецкий пилот ещё не выполнены. Машинные проверки не заменяют проверку смысла.</p><p>SHA-256 словаря: <code>${hash}</code></p><label>Поиск <input id="search" type="search"></label><p><output id="count">${keys.length}</output> строк</p><table><thead><tr><th>Ключ</th><th>Азербайджанский</th><th>Русский</th><th>Английский</th></tr></thead><tbody>${rows}</tbody></table><script>const rows=[...document.querySelectorAll('tbody tr')];document.querySelector('#search').addEventListener('input',e=>{const query=e.target.value.toLocaleLowerCase();let visible=0;for(const row of rows){row.hidden=!row.textContent.toLocaleLowerCase().includes(query);if(!row.hidden)visible++;}document.querySelector('#count').textContent=visible;});</script></body></html>\n`;
fs.writeFileSync(output, html);
const result = { source: 'js/translations.js', sha256: hash, rows: keys.length, counts: Object.fromEntries(locales.map(lang => [lang, Object.keys(translations[lang]).length])), literalReferences: references.size, duplicateKeys: duplicates, missing, placeholderErrors, humanAcceptance: 'pending; Turkish pilot separate and not enabled' };
fs.writeFileSync(output.replace(/\.html$/, '.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
