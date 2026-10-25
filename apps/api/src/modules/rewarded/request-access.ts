import type {IncomingHttpHeaders} from 'node:http';
import type {PrismaClient} from '@prisma/client';
import type {AuthService} from '../auth/auth.service.js';
import {verifyGameToken} from '../auth/game-token.js';
import {RewardedEntitlement} from './entitlement.js';

type Options={enabled?:boolean;trustedOrigins?:readonly string[]};
/** Local integration candidate, deliberately NOT registered as a public route.
 * Derives identity from credentials, never a body/player ID or a profile upsert.
 * Needs the existing AuthService, trusted origins and the separately reviewed DDL.
 */
export class RewardedRequestAccess {
 constructor(private db:PrismaClient,private auth:Pick<AuthService,'getSession'>,private entitlement:RewardedEntitlement,private options:Options={}){}
 private enabled(){
  if(this.options.enabled!==true)throw Error('rewarded_disabled');
  if(this.entitlement.provider!=='levelplay')throw Error('invalid_provider_configuration');
 }
 private async identity(headers:IncomingHttpHeaders,write:boolean,now:number){
  if(!Number.isSafeInteger(now))throw Error('invalid_request');
  const authorization=headers.authorization,cookie=headers.cookie,origin=headers.origin;
  if(authorization!==undefined&&(typeof authorization!=='string'||authorization.length>8192||!/^Bearer [^\s,]+$/i.test(authorization)))throw Error('active_session_required');
  if(cookie!==undefined&&(typeof cookie!=='string'||cookie.length>8192))throw Error('active_session_required');
  // Match the API's cookie/Origin rule even when a bearer accompanies cookies.
  if(write&&cookie&&(!origin||typeof origin!=='string'||!this.options.trustedOrigins?.includes(origin)))throw Error('untrusted_origin');
  if(!authorization&&!cookie)throw Error('active_session_required');
  const token=authorization?.slice(7),claims=token?verifyGameToken(token):null;
  let userId:string|undefined,sessionId:string|undefined,claimedPlayerId:string|undefined;
  if(claims){
   // The shared legacy parser tolerates suffixes; this boundary does not.
   if(token!.split('.').length!==2||claims.provider!=='better-auth'||typeof claims.userId!=='string'||typeof claims.sessionId!=='string'||typeof claims.playerId!=='string')throw Error('active_session_required');
   userId=claims.userId;sessionId=claims.sessionId;claimedPlayerId=claims.playerId;
  }else{
   // Explicit bearer never falls back to a different cookie account.
   const session=await this.auth.getSession(authorization?{authorization}:{cookie});
   userId=session?.user?.id;sessionId=session?.session?.id;
  }
  if(!userId||!sessionId)throw Error('active_session_required');
  const [session,player]=await Promise.all([
   this.db.session.findUnique({where:{id:sessionId},select:{id:true,userId:true,expiresAt:true}}),
   this.db.player.findUnique({where:{userId},select:{id:true,userId:true}})
  ]);
  if(!session||session.userId!==userId||session.expiresAt.getTime()<=now||!player||player.userId!==userId||claimedPlayerId&&player.id!==claimedPlayerId)throw Error('active_session_required');
  const ban=await this.db.playerBan.findFirst({where:{playerId:player.id,revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date(now)}}]},select:{id:true}});
  if(ban)throw Error('active_session_required');
  return {playerId:player.id,userId,sessionId};
 }
 private body(value:unknown,field:string){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!Object.hasOwn(value,field))throw Error('invalid_request');
  return (value as Record<string,unknown>)[field];
 }
 private attempt(value:unknown){
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw Error('invalid_request');
  return value;
 }
 async issue(headers:IncomingHttpHeaders,body:unknown,now=Date.now()){
  this.enabled();if(this.body(body,'optIn')!==true)throw Error('opt_in_required');
  const identity=await this.identity(headers,true,now);
  return this.entitlement.issue(identity.playerId,true,now,identity);
 }
 async status(headers:IncomingHttpHeaders,attemptId:unknown,now=Date.now()){
  this.enabled();const id=this.attempt(attemptId),identity=await this.identity(headers,false,now);
  return this.entitlement.status(identity.playerId,id,identity,now);
 }
 async recover(headers:IncomingHttpHeaders,now=Date.now()){
  this.enabled();const identity=await this.identity(headers,false,now);
  return this.entitlement.recover(identity.playerId,identity,now);
 }
 async cancel(headers:IncomingHttpHeaders,body:unknown,now=Date.now()){
  this.enabled();const id=this.attempt(this.body(body,'attemptId')),identity=await this.identity(headers,true,now);
  // This also binds the attempt to the issuing session before any cancellation.
  await this.entitlement.status(identity.playerId,id,identity,now);
  await this.entitlement.cancel(identity.playerId,id,identity,now);
  return this.entitlement.status(identity.playerId,id,identity,now);
 }
}
