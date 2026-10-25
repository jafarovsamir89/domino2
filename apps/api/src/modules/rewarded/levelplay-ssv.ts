import {createHash,timingSafeEqual} from 'node:crypto';

/** Review candidate, no public route. Exact LevelPlay private-key protocol:
 * https://docs.unity.com/en-us/grow/levelplay/platform/settings/event-handlers
 * Only the init USER_ID is trusted; dynamicUserId/custom fields are not signed.
 * Fixed-length nonce and fixed reward avoid ambiguous concatenated field boundaries.
 */
export function verifyLevelPlaySignature(rawQuery:string,privateKey:string) {
 if(!privateKey||privateKey.length<32||privateKey.length>512)throw Error('invalid_private_key');
 if(!rawQuery||rawQuery.length>4096||rawQuery.startsWith('?')||/[\r\n#]/.test(rawQuery)||/%(?![0-9a-f]{2})/i.test(rawQuery))throw Error('invalid_query');
 const required=['applicationUserId','eventId','rewards','timestamp','signature'];
 // Observed in the real dashboard Test callback (S042). These are UNSIGNED
 // informational additions, deliberately excluded from identity/coin/scope decisions.
 const allowed=new Set([...required,'publisherSubId','country']);
 const parts=rawQuery.split('&'),names=parts.map(p=>p.slice(0,p.indexOf('=')));
 if(parts.length<5||parts.length>7||parts.some(p=>!/^\w+=[^&]*$/.test(p))||new Set(names).size!==names.length||names.some(n=>!allowed.has(n))||required.some(n=>!names.includes(n)))throw Error('invalid_parameters');
 const params=new URLSearchParams(rawQuery),attemptId=params.get('applicationUserId')!,transactionId=params.get('eventId')!,reward=params.get('rewards')!,callbackTime=params.get('timestamp')!,signature=params.get('signature')!;
 if(!/^(?:[a-zA-Z]{2})?$/.test(params.get('country')??'')||!/^[a-zA-Z0-9_-]{0,64}$/.test(params.get('publisherSubId')??''))throw Error('invalid_metadata');
 if(!/^[a-f0-9]{64}$/.test(attemptId)||!/^[a-zA-Z0-9]{16,128}$/.test(transactionId)||reward!=='1'||!/^\d{12}$/.test(callbackTime)||!/^[a-f0-9]{32}$/i.test(signature))throw Error('invalid_binding');
 const expected=createHash('md5').update(callbackTime+transactionId+attemptId+reward+privateKey,'utf8').digest();
 if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw Error('invalid_signature');
 // Validate the calendar without silently normalizing invalid dates. Timezone is a separate policy.
 const [y,m,d,h,min]=[callbackTime.slice(0,4),callbackTime.slice(4,6),callbackTime.slice(6,8),callbackTime.slice(8,10),callbackTime.slice(10,12)].map(Number);
 const date=new Date(Date.UTC(y,m-1,d,h,min));
 if(y<2020||date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d||date.getUTCHours()!==h||date.getUTCMinutes()!==min)throw Error('invalid_callback_time');
 return Object.freeze({attemptId,transactionId,callbackTime});
}

export function verifyLevelPlayQuery(rawQuery:string,options:{privateKey:string;appKey:string;adUnit:string;timestampUtcOffsetMinutes:number;now:number;maxAgeMs?:number}) {
 const message=verifyLevelPlaySignature(rawQuery,options.privateKey),offset=options.timestampUtcOffsetMinutes;
 if(!Number.isSafeInteger(options.now)||!Number.isInteger(offset)||offset< -720||offset>840)throw Error('invalid_clock_policy');
 if(!options.appKey||!options.adUnit)throw Error('invalid_provider_scope');
 const t=message.callbackTime;
 const timestamp=Date.UTC(+t.slice(0,4),+t.slice(4,6)-1,+t.slice(6,8),+t.slice(8,10),+t.slice(10,12))-offset*60000;
 // Signature age is distinct from eligibility. Legacy grants use ten minutes;
 // explicit owner_8day settlement enforces an exact deadline from stored creation time.
 const maxAge=options.maxAgeMs??8*86400000;
 // Explicit owner settlement can add one minute for the protocol's truncated timestamp.
 // The attempt's exact eight-day deadline is still independently enforced in the DB policy.
 if(!Number.isSafeInteger(maxAge)||maxAge<=0||maxAge>8*86400000+60000)throw Error('invalid_clock_policy');
 if(timestamp>options.now+60000||timestamp<options.now-maxAge)throw Error('stale_event');
 // These two values are server route configuration, NOT signed callback fields.
 // Use a separate per-app secret and keep this review app restricted to its one rewarded unit.
 return Object.freeze({...message,timestamp,adUnit:options.adUnit,provider:'levelplay' as const,providerScope:options.appKey});
}
