from google_play_scraper import app, reviews, Sort
from pathlib import Path
import json,re,datetime,time
out=Path('docs/audit/evidence/metrics')
ids=['com.LoopGames.Domino','air.com.jogatina.domino.android','com.flyclops.domino.android','com.beachbum.domino','ru.skillcap.dominoes','loppipoppi.dominoes','com.playvalve.dominoes','com.screenshake.dominodreams','com.neptune.dominogl','com.tappaz.dominoes.free.game.reef.adventure.domino.ocean.fishes']
patterns={'advertising':r'\bads?\b|advert|commercial','payment_coins':r'coin|money|pay|purchas|expensive|price|buy','fairness_bots':r'rigged|cheat|unfair|bot\b|algorithm|opponent|computer','stability':r'crash|freez|stuck|bug|glitch|disconnect|connection|lag|slow|load','social':r'friend|multiplayer|chat|invite|team','rules':r'rule|scor|five|draw|block|point','positive_enjoyment':r'love|enjoy|fun\b|relax|great|excellent'}
apps=[];rows=[];errors=[]
for aid in ids:
 try:
  a=app(aid,lang='en',country='us');a={k:a.get(k) for k in ['appId','title','developer','score','ratings','reviews','installs','updated','released','version','containsAds','offersIAP','inAppProductPrice','description','url','screenshots','contentRating']};a['appId']=aid;apps.append(a)
  rr,_=reviews(aid,lang='en',country='us',sort=Sort.NEWEST,count=60)
  for r in rr:
   text=r.get('content','');rows.append({'appId':aid,'reviewId':r['reviewId'],'date':r['at'].isoformat(),'score':r['score'],'text':text,'themes':[k for k,v in patterns.items() if re.search(v,text,re.I)]})
  print(aid,len(rr),flush=True)
 except Exception as e: errors.append({'appId':aid,'error':str(e)});print(aid,str(e),flush=True)
 time.sleep(.3)
summary={'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'locale':'en_US','sampling':'60 newest accessible reviews per app; convenience sample; keyword multi-label mentions, not verified defects or negative-only sentiment','n':len(rows),'counts':{k:sum(k in r['themes'] for r in rows) for k in patterns},'negativeCounts':{k:sum(k in r['themes'] and r['score']<=2 for r in rows) for k in patterns},'errors':errors}
for name,data in [('competitors.json',apps),('reviews.json',rows),('review-summary.json',summary)]: (out/name).write_text(json.dumps(data,ensure_ascii=False,indent=2))
