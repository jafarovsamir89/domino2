import {test,expect} from './fixtures.mjs';

test('local tests block unmocked external HTTP and WebSocket traffic',async({page})=>{
  await page.goto('/index.html');
  const blocked=await page.evaluate(async()=>{
    const http=await fetch('https://remediation-network-test.invalid/no-network',{method:'POST'}).then(()=>false,()=>true);
    const socket=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('WebSocket boundary did not close')),3000);
      const ws=new WebSocket('wss://remediation-network-test.invalid/no-network');
      ws.onclose=event=>{clearTimeout(timeout);resolve({code:event.code,reason:event.reason})};
    });
    return{http,socket};
  });
  expect(blocked.http).toBe(true);
  expect(blocked.socket).toEqual({code:1008,reason:'External connection blocked by local test boundary'});
});
