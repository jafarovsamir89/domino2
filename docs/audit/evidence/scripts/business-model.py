import json,math,pathlib
scenarios=[dict(name='Пессимистичный',mauRatio=6,sessions=1.4,minutes=6,rewarded=.4,interstitial=.15,fill=.45,rEcpm=[1,1.5,0,3],iEcpm=[.3,.5,0,1],payer=.003,arppu=4,retention=[.18,.04,.008],halfLife=20,cpi=.10),dict(name='Базовый',mauRatio=4.5,sessions=2,minutes=8,rewarded=.9,interstitial=.35,fill=.6,rEcpm=[2.5,3.5,0,7],iEcpm=[.8,1.2,0,2.5],payer=.01,arppu=7,retention=[.28,.10,.035],halfLife=45,cpi=.30),dict(name='Оптимистичный',mauRatio=3.5,sessions=2.5,minutes=10,rewarded=1.5,interstitial=.6,fill=.75,rEcpm=[4,6,0,12],iEcpm=[1.5,2,0,4],payer=.02,arppu=10,retention=[.40,.18,.08],halfLife=90,cpi=.60)]
weights=[.35,.30,.25,.10];rows=[]
for s in scenarios:
 r=sum(a*b for a,b in zip(weights,s['rEcpm']));i=sum(a*b for a,b in zip(weights,s['iEcpm']));s['adArpdau']=(s['rewarded']*r+s['interstitial']*i)*s['fill']/1000;s['iapArpdau']=s['mauRatio']*s['payer']*s['arppu']*.85/30;s['netArpdau']=s['adArpdau']+s['iapArpdau'];D1,D7,D30=s['retention'];R=[1]
 for d in range(1,366):
  if d<=7:v=D1*(D7/D1)**((d-1)/6)
  elif d<=30:v=D7*(D30/D7)**((d-7)/23)
  else:v=D30*2**(-(d-30)/s['halfLife'])
  R.append(v)
 s['activeDays365']=sum(R);s['revenueLtv365']=s['activeDays365']*s['netArpdau'];s['contributionLtv365']=s['revenueLtv365']*.8;s['cpi70PercentOfContribution']=s['contributionLtv365']*.7;s['payerCac']=s['cpi']/s['payer']
 for dau,infra,support,product in [(1000,120,300,2500),(10000,400,1500,4000),(100000,2500,6000,10000)]:
  ad=30*dau*s['adArpdau'];iap=dau*s['mauRatio']*s['payer']*s['arppu'];netiap=iap*.85;cost=infra+support+product;rev=ad+netiap
  # Explicit acquisition budget: replace 10% of MAU per month with paid users.
  paidInstalls=dau*s['mauRatio']*.1;marketing=paidInstalls*s['cpi']
  rows.append(dict(scenario=s['name'],dau=dau,mau=dau*s['mauRatio'],ccuAverage=dau*s['sessions']*s['minutes']/1440,ccuPeakModel=3*dau*s['sessions']*s['minutes']/1440,ads=ad,iapGross=iap,iapNet=netiap,revenueNet=rev,infra=infra,support=support,product=product,operations=cost,operatingProfitBeforeUA=rev-cost,paidInstalls=paidInstalls,ua=marketing,operatingProfitAfterUA=rev-cost-marketing,breakEvenDauAtThisCost=cost/(30*s['netArpdau'])))
pathlib.Path('docs/audit/evidence/metrics/business-model.json').write_text(json.dumps(dict(currency='USD',allInputsAreAssumptions=True,geography=dict(zip(['AZ','TR','RU','Other'],weights)),storeFeeAssumption=.15,scenarios=scenarios,rows=rows),ensure_ascii=False,indent=2))
for r in rows:print(r['scenario'],r['dau'],round(r['revenueNet']),round(r['operatingProfitBeforeUA']),round(r['operatingProfitAfterUA']))
