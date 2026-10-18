import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'domino-source-check-'));
try{
  fs.mkdirSync(path.join(temp,'scripts'));fs.mkdirSync(path.join(temp,'js'));fs.mkdirSync(path.join(temp,'.tmp/generated'),{recursive:true});
  fs.copyFileSync('scripts/check-mojibake.mjs',path.join(temp,'scripts/check-mojibake.mjs'));
  const damaged=String.fromCharCode(0x413,0xa7);
  fs.writeFileSync(path.join(temp,'js/app.js'),'const readable = "Normal application source";\n');
  fs.writeFileSync(path.join(temp,'.tmp/generated/copied-source.js'),'// '+damaged+'\n');
  const run=()=>spawnSync(process.execPath,['scripts/check-mojibake.mjs'],{cwd:temp,env:{PATH:process.env.PATH},encoding:'utf8'});
  const valid=run();assert.equal(valid.status,0,'Generated temporary files must not fail the application source check: '+valid.stderr);
  fs.writeFileSync(path.join(temp,'js/app.js'),'// '+damaged+'\n');
  const invalid=run();assert.equal(invalid.status,1);assert.match(invalid.stderr,/js[/\\]app\.js/);
  console.log(JSON.stringify({temporaryArtifactsIgnored:true,realApplicationEncodingErrorStillRejected:true}));
}finally{fs.rmSync(temp,{recursive:true,force:true})}
