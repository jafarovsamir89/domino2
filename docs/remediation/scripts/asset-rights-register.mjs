// Inventory only: an absent document does not imply infringement or permission.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const target = 'docs/remediation/ASSET_RIGHTS_REGISTER.json';
const files = execFileSync('git', ['ls-files', '-z', '--', 'assets', 'www/assets', 'js/vendor', 'www/js/vendor', 'android/app/src/main/res'], { encoding: 'utf8' }).split('\0').filter(Boolean).sort();
const previous = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')).assets : [];
const groups = new Map();
for (const file of files) {
    const bytes = fs.readFileSync(file), sha256 = createHash('sha256').update(bytes).digest('hex');
    if (!groups.has(sha256)) {
        const old = previous.find(row => row.sha256 === sha256);
        groups.set(sha256, { sha256, bytes: bytes.length, paths: [], source: old?.source || null, license: old?.license || null, evidence: old?.evidence || [], reviewStatus: old?.reviewStatus || 'owner-evidence-pending' });
    }
    groups.get(sha256).paths.push(file);
}
const output = { schemaVersion: 1, scope: 'Tracked shipped media, Android resources and bundled vendor scripts. Identical bytes share one rights record; source paths are retained. Root ISC package metadata does not establish rights to each asset.', assets: [...groups.values()] };
for (const row of output.assets) if (row.reviewStatus === 'verified' && (!row.source || !row.license || !row.evidence.length)) throw Error(`Verified asset needs source/license/evidence: ${row.paths[0]}`);
const content = JSON.stringify(output, null, 2) + '\n';
if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) throw Error('Asset register stale: run node docs/remediation/scripts/asset-rights-register.mjs and review new hashes');
} else fs.writeFileSync(target, content);
console.log(JSON.stringify({ files: files.length, distinctContent: output.assets.length, pendingEvidence: output.assets.filter(row => row.reviewStatus !== 'verified').length }));
