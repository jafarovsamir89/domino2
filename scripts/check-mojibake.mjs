#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const includeExts = new Set(['.js', '.ts', '.tsx', '.jsx', '.json', '.html', '.css', '.md', '.mjs', '.cjs']);
const skipDirs = new Set([
  '.git',
  '.tmp',
  'node_modules',
  'coverage',
  'dist',
  'build',
  '.next',
  '.turbo',
  'vendor',
]);

const suspiciousPatterns = [
  /Д±|Г§|Дџ|Й™|Г¶|Гј|QoЕџ|AxtarД|YenilЙ|SorД|MЙ|OtaД|qayД|matГ§|sessiyanД|gГ¶|gГј|hЙ/g,
  /РќРµР·Р°РІРµСЂ|РџСЂРѕРґРѕР»Р¶РёС‚|Р’Р°С€Р°|РРіСЂР°|РњРѕР¶РЅРѕ|РІ РєРѕРјРЅР°С‚|РџРѕРґРєР»СЋС‡РёС‚СЊСЃСЏ|РЎРѕР·РґР°С‚СЊ|Р”РѕРјРёРЅРѕ-РџСЏС‚РµСЂРѕС‡РєР°|РљР»Р°СЃСЃРёС‡РµСЃРєРѕРµ/g,
  /\uFFFD/g,
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (includeExts.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

function lineAndColumn(text, index) {
  const before = text.slice(0, index);
  const lines = before.split(/\r?\n/);
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

const files = walk(rootDir).filter((file) => {
  const rel = path.relative(rootDir, file);
  return !rel.startsWith(`js${path.sep}vendor${path.sep}`) &&
    !rel.startsWith(`www${path.sep}js${path.sep}vendor${path.sep}`) &&
    rel !== `scripts${path.sep}check-mojibake.mjs` &&
    !rel.startsWith(`www${path.sep}`) &&
    !rel.startsWith(`android${path.sep}`) &&
    !rel.startsWith('docs' + path.sep) &&
    !rel.startsWith('README.') &&
    !rel.startsWith('IDEA.');
});

const findings = [];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const pattern of suspiciousPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const pos = lineAndColumn(text, match.index);
      findings.push({
        file: path.relative(rootDir, file),
        line: pos.line,
        column: pos.column,
        snippet: match[0],
      });
      if (findings.length >= 100) break;
    }
    if (findings.length >= 100) break;
  }
  if (findings.length >= 100) break;
}

if (findings.length > 0) {
  console.error('[mojibake-check] Suspicious encoding patterns detected:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line}:${finding.column} -> ${JSON.stringify(finding.snippet)}`);
  }
  console.error('[mojibake-check] Fix the source strings before syncing or deploying.');
  process.exit(1);
}

console.log('[mojibake-check] OK: no suspicious mojibake patterns found.');
