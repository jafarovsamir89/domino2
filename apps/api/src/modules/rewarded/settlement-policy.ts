import type {VerifiedAd} from './ssv.js';

export const OWNER_SETTLEMENT_WINDOW_MS=8*86400000;
export function ownerSettlementDeadline(createdAt:number,expiresAt:number){
 if(!Number.isSafeInteger(createdAt)||!Number.isSafeInteger(expiresAt)||expiresAt<=createdAt||expiresAt-createdAt>10*60000)throw Error('invalid_attempt_clock');
 const deadline=createdAt+OWNER_SETTLEMENT_WINDOW_MS;
 if(!Number.isSafeInteger(deadline))throw Error('invalid_attempt_clock');
 return deadline;
}

/** Owner-approved D1-D3, LevelPlay only and explicitly configured.
 * Cancellation and old-session loss do not void a provider-confirmed completion.
 * Caller must authenticate the provider, bind scope, check the current account/ban,
 * and use the persisted ORIGINAL claim day/base/cap in the same transaction.
 */
export function ownerSettlementEligibility(input:{enabled:boolean;optIn:boolean;attemptId:string;attemptPlayerId:string;playerId:string;createdAt:number;expiresAt:number;now:number;consumed:boolean;grantsForOriginalDay:number},ad:VerifiedAd):'ready'{
 if(!input.enabled)throw Error('rewarded_disabled');
 if(!input.optIn)throw Error('opt_in_required');
 if(!input.playerId||input.attemptId!==ad.attemptId||input.attemptPlayerId!==input.playerId)throw Error('wrong_owner_or_day');
 const deadline=ownerSettlementDeadline(input.createdAt,input.expiresAt);
 if(!Number.isSafeInteger(input.now)||input.now<input.createdAt||input.now>=deadline)throw Error('expired_attempt');
 if(input.consumed)throw Error('attempt_unavailable');
 if(!Number.isInteger(input.grantsForOriginalDay)||input.grantsForOriginalDay<0||input.grantsForOriginalDay>=1)throw Error('frequency_cap');
 return 'ready';
}
