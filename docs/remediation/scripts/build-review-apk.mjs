// Build a side-by-side, loopback-only review app. Never install or modify Play.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd(), work=path.join(root,'.tmp/mobile-review'), appId='az.simplesoft.dominotelefon.audit';
if (JSON.parse(await fs.readFile('package.json','utf8')).name!=='domino2') throw Error('Run from Domino root');
await fs.mkdir(work,{recursive:true});
await fs.rm(path.join(work,'android'),{recursive:true,force:true});
await fs.rm(path.join(work,'www'),{recursive:true,force:true});
await fs.cp('android',path.join(work,'android'),{recursive:true,filter:p=>!p.split(path.sep).some(x=>['build','.gradle','keystore.properties','google-services.json','gradle.properties'].includes(x))&&!/\.(?:jks|keystore|p12|pem)$/i.test(p)});
await fs.cp('www',path.join(work,'www'),{recursive:true});
await fs.copyFile('package.json',path.join(work,'package.json'));
try { await fs.symlink(path.join(root,'node_modules'),path.join(work,'node_modules'),'dir'); } catch(e) { if(e.code!=='EEXIST') throw e; }
const config=JSON.parse(await fs.readFile('capacitor.config.json','utf8'));
config.appId=appId; config.appName='Domino Review'; config.server={androidScheme:'https'}; config.android={...config.android,allowMixedContent:true};
await fs.writeFile(path.join(work,'capacitor.config.json'),JSON.stringify(config,null,2));
const edit=async(rel,fn)=>{const p=path.join(work,rel);await fs.writeFile(p,fn(await fs.readFile(p,'utf8')));};
await edit('android/app/build.gradle',s=>s.replace('applicationId "az.simplesoft.dominotelefon"',`applicationId "${appId}"`));
await edit('android/app/src/main/res/values/strings.xml',s=>s.replaceAll('>Domino<','>Domino Review<').replaceAll('>az.simplesoft.dominotelefon<',`>${appId}<`));
await edit('android/app/src/main/AndroidManifest.xml',s=>s.replace('android:scheme="domino"','android:scheme="domino-audit"'));
await edit('android/app/src/main/java/az/simplesoft/dominotelefon/MainActivity.java',s=>s.replace('WebSettings.MIXED_CONTENT_NEVER_ALLOW','WebSettings.MIXED_CONTENT_ALWAYS_ALLOW').replace(/        registerPlugin\(Domino(?:GoogleAuth|Browser|DeviceRegion)Plugin\.class\);\n/g,''));
await fs.writeFile(path.join(work,'android/app/src/main/res/xml/network_security_config.xml'),`<?xml version="1.0" encoding="utf-8"?><network-security-config><base-config cleartextTrafficPermitted="false"/><domain-config cleartextTrafficPermitted="true"><domain>127.0.0.1</domain><domain>localhost</domain></domain-config></network-security-config>`);
// Do not copy a machine's Gradle properties, which may contain credentials.
await fs.writeFile(path.join(work,'android/gradle.properties'),'android.useAndroidX=true\norg.gradle.jvmargs=-Xmx1536m\n');
const injection=`<meta name="domino-local-review" content="s039"><meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:4186 ws://127.0.0.1:4186; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'"><script>window.DOMINO_ENDPOINTS={API_BASE:'http://127.0.0.1:4186/api',GAME_HTTP_BASE:'http://127.0.0.1:4186',GAME_WS_URL:'ws://127.0.0.1:4186'};window.DOMINO_PLATFORM_API_URL='http://127.0.0.1:4186/api';window.DOMINO_SERVER_URL='http://127.0.0.1:4186';</script><script type="module" src="/review/board-test.js"></script><script type="module" src="/review/review-entry.js"></script>`;
await edit('www/index.html',s=>s.replace('<head>','<head>'+injection));
await fs.copyFile('docs/remediation/review/audio.html',path.join(work,'www/review-audio.html'));
await fs.cp('docs/remediation/review',path.join(work,'www/review'),{recursive:true});
await edit('www/review-audio.html',s=>s.replace('<head>','<head>'+injection));
const candidates=[process.env.JAVA_HOME,path.join(root,'.tmp/jdk21/Contents/Home')].filter(Boolean);
const java=candidates.find(home=>{try{return /version "21\./.test(execFileSync(path.join(home,'bin/java'),['-version'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})||'');}catch{return false;}});
// java -version writes to stderr; inspect the release metadata as the portable fallback.
let selectedJava=java;
if(!selectedJava) for(const home of candidates){try{if(/^JAVA_VERSION="21\./m.test(await fs.readFile(path.join(home,'release'),'utf8'))){selectedJava=home;break;}}catch{}}
if(!selectedJava) throw Error('JDK21 required: set JAVA_HOME to JDK21 or provide .tmp/jdk21/Contents/Home');
const env={...process.env,JAVA_HOME:selectedJava};
execFileSync(process.execPath,[path.join(root,'node_modules/@capacitor/cli/bin/capacitor'),'sync','android'],{cwd:work,env,stdio:'inherit'});
execFileSync('./gradlew',['testDebugUnitTest','assembleDebug','--console=plain'],{cwd:path.join(work,'android'),env,stdio:'inherit'});
const apk=path.join(work,'android/app/build/outputs/apk/debug/app-debug.apk');
const props=await fs.readFile(path.join(work,'android/local.properties'),'utf8').catch(()=>'');
const sdk=process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || props.match(/^sdk.dir=(.+)$/m)?.[1]?.replaceAll('\\:',':');
if(!sdk) throw Error('Set ANDROID_HOME to locate aapt for mandatory audit package verification');
const versions=(await fs.readdir(path.join(sdk,'build-tools'))).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
const badging=execFileSync(path.join(sdk,'build-tools',versions[0],'aapt'),['dump','badging',apk],{encoding:'utf8'});
if(!badging.includes(`package: name='${appId}'`)) throw Error('Refusing non-audit package');
const bytes=await fs.readFile(apk);
const result={sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTreeChangesIncluded:true,appId,apk:path.relative(root,apk),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,installed:false,scope:'debug synthetic review, no Play performance claim',endpoints:['127.0.0.1:4186'],audioPage:'https://localhost/review-audio.html'};
await fs.writeFile('docs/remediation/evidence/session-039/review-apk.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
