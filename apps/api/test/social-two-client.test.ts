import test from 'node:test';import assert from 'node:assert/strict';
process.env.BETTER_AUTH_SECRET||='s039-local-synthetic-secret-not-used-in-production';
const {SocialService}=await import('../src/modules/social/social.service.js');
test('two authenticated service clients: create, duplicate accept and expiry preserve a single invite',async()=>{
 const a={id:'s039-a',displayName:'Synthetic A',isGuest:false},b={id:'s039-b',displayName:'Synthetic B',isGuest:false};let current:any=null,creates=0,updates=0;
 const db:any={player:{findUnique:async()=>b},friendConnection:{findFirst:async()=>({id:'synthetic-friend',status:'accepted'})},playInvite:{findFirst:async()=>current,findUnique:async()=>current,create:async({data}:any)=>{creates++;current={...data,id:'s039-invite',inviter:a,invitee:b,createdAt:new Date(),updatedAt:new Date(),respondedAt:null};return current;},update:async({data}:any)=>{updates++;Object.assign(current,data,{updatedAt:new Date()});return current;}},$transaction:async(fn:any)=>fn(db)};
 const clientA=new SocialService(db,{} as any),clientB=new SocialService(db,{} as any);(clientA as any).getCurrentPlayer=async()=>a;(clientB as any).getCurrentPlayer=async()=>b;
 const sent=await clientA.createPlayInvite({},{inviteePlayerId:b.id});assert.equal(sent.item.status,'pending');
 const accepted=await clientB.acceptPlayInvite({},sent.item.id);assert.ok('item' in accepted);assert.equal(accepted.item?.status,'accepted');const afterAccept=updates;
 const duplicate=await clientB.acceptPlayInvite({},sent.item.id);assert.ok('item' in duplicate);assert.equal(duplicate.item?.id,sent.item.id);assert.equal(updates,afterAccept);assert.equal(creates,1);
 await assert.rejects(()=>clientA.acceptPlayInvite({},sent.item.id),/Invitation not found/);
 current.status='pending';current.expiresAt=new Date(Date.now()-1000);const expired=await clientB.acceptPlayInvite({},sent.item.id);assert.equal(expired.ok,false);assert.equal(current.status,'expired');
 const expiredAgain=await clientB.acceptPlayInvite({},sent.item.id);assert.equal(expiredAgain.ok,false);assert.equal(creates,1);
 // Contract uses a shared repository stub, not an HTTP/DB/Colyseus match claim.
});
