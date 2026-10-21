// Explicit helper for the joint review phase; scope limited to the verified .audit APK.
import fs from 'node:fs';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const meta=JSON.parse(fs.readFileSync('docs/remediation/evidence/session-039/review-apk.json'));
if(meta.appId!=='az.simplesoft.dominotelefon.audit'||!meta.apk.startsWith('.tmp/mobile-review/'))throw Error('Non-audit artifact refused');
if(createHash('sha256').update(fs.readFileSync(meta.apk)).digest('hex')!==meta.sha256)throw Error('APK changed: rebuild and verify');
const args=process.argv.slice(2),serial=args[args.indexOf('--serial')+1];
if(!args.includes('--install')){console.log('Verified audit artifact. To install in the joint review phase: node docs/remediation/scripts/install-review-apk.mjs --install --serial DEVICE_SERIAL');process.exit(0);}
if(!args.includes('--serial')||!serial||serial.startsWith('-'))throw Error('Explicit device serial required');
const adb=(...cmd)=>execFileSync('adb',['-s',serial,...cmd],{stdio:'inherit'});
adb('install','-r',meta.apk);adb('reverse','tcp:4186','tcp:4186');
adb('shell','am','start','-n','az.simplesoft.dominotelefon.audit/az.simplesoft.dominotelefon.MainActivity');
console.log('Audit app launched; Play package and its data were not targeted. Start device-review-preview.mjs for the synthetic API.');
