// Copy tracked/staged source into a disposable directory without .env or caches.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),relative=process.argv[2]||'';
if(!/^\.tmp\/remediation-s\d{3}\/[a-z0-9-]+$/.test(relative))throw Error('Expected .tmp/remediation-sNNN/NAME');
const target=path.resolve(root,relative);if(fs.existsSync(target))throw Error('Target already exists; do not overwrite an active check');
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
let copied=0;const omittedEnv=[];
fs.mkdirSync(target,{recursive:true});
for(const name of files){
  if(name.startsWith('docs/audit/evidence/')||name.startsWith('docs/remediation/evidence/'))continue;
  const base=path.basename(name);if(base.startsWith('.env')&&!base.endsWith('.example')){omittedEnv.push(name);continue}
  const source=path.join(root,name),destination=path.join(target,name),stat=fs.lstatSync(source);
  if(!stat.isFile())throw Error('Expected regular tracked source: '+name);
  fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(source,destination);fs.chmodSync(destination,stat.mode&0o777);copied++;
}
console.log(JSON.stringify({target:relative,copied,omittedEnv,dependencyDirectoriesCopied:false}));
