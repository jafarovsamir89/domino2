import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve('docs/audit');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'evidence/metrics/sha256-manifest.json'),'utf8'));
const problems=[];
for(const [name,expected] of Object.entries(manifest)){
 const file=path.resolve(root,name);
 if(!file.startsWith(root+path.sep)){problems.push({file:name,error:'invalid path'});continue}
 if(!fs.existsSync(file)){problems.push({file:name,error:'missing'});continue}
 const actual=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 if(actual!==expected)problems.push({file:name,error:'hash mismatch'});
}
console.log(JSON.stringify({files:Object.keys(manifest).length,problems},null,2));
if(problems.length)process.exitCode=1;
