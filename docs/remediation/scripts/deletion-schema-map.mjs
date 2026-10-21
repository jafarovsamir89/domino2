// Metadata only: does not instantiate PrismaClient, read DATABASE_URL, or query data.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Prisma} from '@prisma/client';
const schema=fs.readFileSync('packages/db/prisma/schema.prisma');
const models=Prisma.dmmf.datamodel.models;
const relations=models.flatMap(model=>model.fields.filter(f=>f.kind==='object'&&f.relationFromFields?.length).map(f=>({child:model.name,parent:f.type,fields:f.relationFromFields,onDelete:f.relationOnDelete||'database-default-needs-review'})));
const deleting=new Set(['User']);let changed=true;
while(changed){changed=false;for(const relation of relations)if(deleting.has(relation.parent)&&relation.onDelete==='Cascade'&&!deleting.has(relation.child)){deleting.add(relation.child);changed=true;}}
const retained=relations.filter(r=>deleting.has(r.parent)&&r.onDelete!=='Cascade');
const out={schemaVersion:1,sourceSha256:createHash('sha256').update(schema).digest('hex'),scope:'schema metadata only; no user data or deletion executed',models:models.map(m=>({name:m.name,fields:m.fields.filter(f=>f.kind!=='object').map(f=>f.name)})),relations,userDeleteCascade:[...deleting],userDeleteRetainedRelations:retained,decisionsPending:['Owner/operator and authenticated identity verification','Deletion vs anonymization per data category, including name snapshots/free text/attachments','PaymentEvent payloads/external IDs without a Player FK','Active matches/reserved coins/claims: finish or refund before deletion','Backup expiry and prevention of deleted-account resurrection on restore','Sentry/push/auth/provider data and processors','Published privacy/Console/web request wording and realistic deadlines'],warning:'Deleting User alone sets Player.userId null; it does not erase Player, chats, wallet or displayNameSnapshot. SQL cascades are not an approved deletion/retention policy.'};
fs.writeFileSync('docs/remediation/evidence/session-039/deletion-schema-map.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({models:models.length,relations:relations.length,userDeleteCascade:out.userDeleteCascade,userDeleteRetainedRelations:retained}));
