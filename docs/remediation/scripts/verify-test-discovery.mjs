import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'domino-test-discovery-'));
const env={PATH:process.env.PATH};
try{
  fs.mkdirSync(path.join(temp,'scripts'));fs.mkdirSync(path.join(temp,'test'));
  const script=path.join(temp,'scripts/test-all.cjs');
  fs.copyFileSync('server/scripts/test-all.cjs',script);
  fs.writeFileSync(path.join(temp,'test/newly-added.test.js'),"const test=require('node:test');const assert=require('node:assert/strict');test('new file is discovered without editing package scripts',()=>assert.equal(2+2,4));\n");
  fs.writeFileSync(path.join(temp,'test/fixture.js'),"throw Error('Non-test fixture must not execute');\n");
  const run=()=>spawnSync(process.execPath,[script,'--test-reporter=tap'],{cwd:temp,env,encoding:'utf8'});
  const pass=run();assert.equal(pass.status,0,pass.stderr);assert.match(pass.stdout,/new file is discovered/);assert.doesNotMatch(pass.stdout,/Non-test fixture must not execute/);
  fs.mkdirSync(path.join(temp,'test/nested'));
  fs.writeFileSync(path.join(temp,'test/nested/child.test.cjs'),"require('node:test')('nested CommonJS test is discovered',()=>{});\n");
  fs.writeFileSync(path.join(temp,'test/nested/module.test.mjs'),"import test from 'node:test';test('nested ES module test is discovered',()=>{});\n");
  const nested=run();assert.equal(nested.status,0,nested.stderr);assert.match(nested.stdout,/nested CommonJS test/);assert.match(nested.stdout,/nested ES module test/);
  fs.writeFileSync(path.join(temp,'test/another-new.test.js'),"const test=require('node:test');const assert=require('node:assert/strict');test('new failure propagates to caller',()=>assert.fail('expected discovery probe failure'));\n");
  const fail=run();assert.equal(fail.status,1);assert.match(fail.stdout,/new failure propagates/);
  console.log(JSON.stringify({newTestAutoDiscovered:true,nestedCommonJsAndEsmDiscovered:true,nonTestFixtureIgnored:true,failureExitPropagated:true,node:process.version}));
}finally{fs.rmSync(temp,{recursive:true,force:true})}
