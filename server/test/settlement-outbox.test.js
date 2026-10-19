const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SettlementOutbox } = require('../settlementOutbox');
const intent = { roomId:'r', matchId:'m', stakeKey:'stake_200', result:'win', winnerUserIds:['winner'] };
function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(),'domino-outbox-'));
    t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    return new SettlementOutbox(dir);
}

test('intent exists before transport, has restrictive permissions and contains no bearer',async t=>{
    const store=fixture(t);
    await store.submit(intent,async body=>{
        const file=fs.readdirSync(store.directory).find(n=>n.endsWith('.intent.json'));
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(store.directory,file))).payload,body);
        assert.equal(fs.statSync(path.join(store.directory,file)).mode & 0o777,0o600);
        assert(!fs.readFileSync(path.join(store.directory,file),'utf8').includes('authToken'));
        return {ok:true,settled:2};
    });
});

test('transport failure survives a fresh store, response rejection is never acknowledged',async t=>{
    const store=fixture(t);
    await assert.rejects(store.submit(intent,async()=>{throw Error('timeout')}));
    const restarted=new SettlementOutbox(store.directory);
    assert.deepEqual(await restarted.reconcile({transport:async()=>({ok:false})}),{attempted:1,acknowledged:0,failed:1,pending:1});
    assert.deepEqual(await restarted.reconcile({transport:async()=>({ok:true,settled:2})}),{attempted:1,acknowledged:1,failed:0,pending:0});
    assert.equal((await restarted.reconcile({transport:()=>assert.fail('already acknowledged')})).attempted,0);
});

test('response loss after commit replays once by match, and ack is reused without HTTP',async t=>{
    const store=fixture(t);let credits=0,requests=0;
    const settled=new Set();const api=async p=>{requests++;if(settled.has(p.matchId))return {ok:true,skipped:true};settled.add(p.matchId);credits++;throw Error('response lost after DB commit')};
    await assert.rejects(store.submit(intent,api));
    assert.equal((await new SettlementOutbox(store.directory).reconcile({transport:api})).acknowledged,1);
    const ack=await store.submit(intent,()=>assert.fail('cached ack'));
    assert.equal(ack.skipped,true);assert.equal(credits,1);assert.equal(requests,2);
});

test('concurrent submissions share delivery and conflicting winner/refund cannot replace durable intent',async t=>{
    const store=fixture(t);let calls=0,release;
    const transport=()=>{calls++;return new Promise(r=>release=r)};
    const a=store.submit(intent,transport),b=store.submit({...intent},transport);
    assert.throws(()=>store.submit({...intent,result:'refund',winnerUserIds:[]},transport),/conflict/);
    release({ok:true,settled:2});await Promise.all([a,b]);assert.equal(calls,1);
    assert.deepEqual(store.read(`${store.key(intent)}.intent.json`).payload,intent);
});

test('unwritable storage never sends settlement and corrupt intent is retained',async t=>{
    const store=fixture(t),blocker=path.join(store.directory,'file');fs.writeFileSync(blocker,'x');
    const blocked=new SettlementOutbox(path.join(blocker,'child'));
    assert.throws(()=>blocked.submit(intent,()=>assert.fail('must not send')));
    store.initialize();const key=store.key(intent);fs.writeFileSync(path.join(store.directory,key+'.intent.json'),'{broken');
    const result=await store.reconcile({transport:()=>assert.fail('corrupt must not send')});assert.equal(result.failed,1);
    assert.equal(fs.readFileSync(path.join(store.directory,key+'.intent.json'),'utf8'),'{broken');
});

test('invalid intents and free games never create payable files',t=>{
    const store=fixture(t);
    for(const change of [{matchId:''},{roomId:''},{stakeKey:'free'},{result:'unknown'},{winnerUserIds:null}])assert.throws(()=>store.enqueue({...intent,...change}));
    assert.equal(fs.readdirSync(store.directory).length,0);
});

test('bounded reconciliation rotates so permanent rejection cannot starve later results',async t=>{
    const store=fixture(t);for(let i=0;i<5;i++)store.enqueue({...intent,matchId:'m'+i});
    const seen=new Set();for(let i=0;i<5;i++)await store.reconcile({limit:1,transport:async p=>{seen.add(p.matchId);throw Error('still rejected')}});
    assert.equal(seen.size,5);
});

test('corrupt receipt is reported and retained instead of silently hiding a pending intent',async t=>{
    const store=fixture(t),key=store.enqueue(intent);fs.writeFileSync(path.join(store.directory,key+'.receipt.json'),'{broken');
    assert.equal((await store.reconcile({transport:()=>assert.fail('operator must inspect corruption')})).failed,1);
});

test('production requires explicit absolute persistent location',()=>{
    const {getSettlementOutbox}=require('../settlementOutbox');
    const saved={env:process.env.NODE_ENV,dir:process.env.ECONOMY_OUTBOX_DIR};
    try{process.env.NODE_ENV='production';delete process.env.ECONOMY_OUTBOX_DIR;assert.throws(()=>getSettlementOutbox(),/persistent-volume/);process.env.ECONOMY_OUTBOX_DIR='relative';assert.throws(()=>getSettlementOutbox(),/persistent-volume/);}
    finally{if(saved.env===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=saved.env;if(saved.dir===undefined)delete process.env.ECONOMY_OUTBOX_DIR;else process.env.ECONOMY_OUTBOX_DIR=saved.dir;}
});
