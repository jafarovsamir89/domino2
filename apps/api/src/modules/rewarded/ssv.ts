import {createPublicKey, verify} from 'node:crypto';

/** AdMob raw-query verifier. Not registered as a public route or a reward grant.
 * The caller must supply trusted cached Google public keys (never callback keys).
 * https://developers.google.com/admob/android/ssv
 */
export type VerifiedAd = Readonly<{transactionId:string; attemptId:string; timestamp:number; adUnit:string}>;
export function verifyAdMobQuery(rawQuery:string, options:{keys:ReadonlyMap<string,string>;adUnit:string;now:number;maxAgeMs?:number}):VerifiedAd {
  if(!rawQuery || rawQuery.length>8192 || rawQuery.startsWith('?') || /[\r\n#]/.test(rawQuery)) throw Error('invalid_query');
  const parts=rawQuery.split('&'), keys=parts.map(p=>p.slice(0,p.indexOf('=')));
  if(parts.some(p=>!/^\w+=[^&]*$/.test(p)) || new Set(keys).size!==keys.length || keys.at(-2)!=='signature' || keys.at(-1)!=='key_id') throw Error('invalid_parameters');
  const allowed=new Set(['ad_network','ad_unit','custom_data','reward_amount','reward_item','timestamp','transaction_id','user_id','signature','key_id']);
  if(keys.some(k=>!allowed.has(k))) throw Error('unexpected_parameter');
  const params=new URLSearchParams(rawQuery), signature=params.get('signature')||'', keyId=params.get('key_id')||'';
  if(!/^[A-Za-z0-9_-]+={0,2}$/.test(signature) || !/^\d{1,20}$/.test(keyId)) throw Error('invalid_signature_encoding');
  const trusted=options.keys.get(keyId); if(!trusted) throw Error('unknown_key');
  const key=createPublicKey(trusted);
  if(key.asymmetricKeyType!=='ec' || key.asymmetricKeyDetails?.namedCurve!=='prime256v1') throw Error('invalid_key');
  const signed=parts.slice(0,-2).join('&');
  if(!verify('sha256',Buffer.from(signed,'utf8'),key,Buffer.from(signature,'base64url'))) throw Error('invalid_signature');
  const transactionId=params.get('transaction_id')||'', attemptId=params.get('custom_data')||'', timestamp=Number(params.get('timestamp'));
  const maxAge=options.maxAgeMs??15*60_000;
  if(!Number.isSafeInteger(options.now)||!Number.isSafeInteger(maxAge)||maxAge<=0||maxAge>24*60*60_000) throw Error('invalid_clock_policy');
  if(params.get('ad_unit')!==options.adUnit || !options.adUnit) throw Error('wrong_ad_unit');
  if(!/^[a-fA-F0-9]{16,128}$/.test(transactionId)||!/^[-_A-Za-z0-9]{32,128}$/.test(attemptId)) throw Error('invalid_binding');
  if(!/^\d{10,16}$/.test(params.get('timestamp')||'')||!Number.isSafeInteger(timestamp)||timestamp>options.now+60_000||timestamp<options.now-maxAge) throw Error('stale_event');
  return Object.freeze({transactionId,attemptId,timestamp,adUnit:options.adUnit});
}

/** Server policy only. No client completion callback/amount is accepted. Default off. */
export function rewardEligibility(input:{enabled:boolean;optIn:boolean;attemptId:string;attemptPlayerId:string;playerId:string;expiresAt:number;now:number;day:string;attemptDay:string;grantsToday:number;cap:number;cancelled:boolean;consumed:boolean},ad:VerifiedAd):'ready' {
  if(!input.enabled) throw Error('rewarded_disabled');
  if(!input.optIn) throw Error('opt_in_required');
  if(!input.playerId || input.attemptId!==ad.attemptId || input.attemptPlayerId!==input.playerId || input.attemptDay!==input.day) throw Error('wrong_owner_or_day');
  if(!Number.isFinite(input.now)||!Number.isFinite(input.expiresAt)||input.expiresAt<=input.now || ad.timestamp>input.expiresAt) throw Error('expired_attempt');
  if(input.cancelled || input.consumed) throw Error('attempt_unavailable');
  if(!Number.isInteger(input.cap)||input.cap<1||input.cap>3||!Number.isInteger(input.grantsToday)||input.grantsToday<0||input.grantsToday>=input.cap) throw Error('frequency_cap');
  return 'ready';
}
