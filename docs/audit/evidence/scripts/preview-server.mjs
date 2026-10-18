// Local audit host. Product files are read without modification.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const types={'.html':'text/html','.js':'application/javascript','.cjs':'application/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.webm':'video/webm','.mp3':'audio/mpeg'};
http.createServer(async(req,res)=>{
 try{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(root+path.sep))throw Error('forbidden');
  let body=await fs.readFile(file);
  if(file.endsWith('.html') && req.url.includes('audit-device=1')) { const f=JSON.parse(await fs.readFile('.tmp/audit-profile.json','utf8'));body=Buffer.from(body.toString().replace('<head>', '<head><script>localStorage.setItem("dominoPlatformGameToken",'+JSON.stringify(f.token)+');localStorage.setItem("dominoPlatformProfile",'+JSON.stringify(JSON.stringify({...f.player,isGuest:false}))+');localStorage.setItem("dominoAuthProfile",'+JSON.stringify(JSON.stringify({...f.player,name:f.player.displayName,isGuest:false}))+');localStorage.setItem("dominoLanguage","ru");</script>')); }
  if(file.endsWith('.html'))body=Buffer.from(body.toString().replace('<head>',`<head><script>window.DOMINO_ENDPOINTS={API_BASE:'http://127.0.0.1:4300/api',GAME_HTTP_BASE:'http://127.0.0.1:4567',GAME_WS_URL:'ws://127.0.0.1:4567'};window.DOMINO_SERVER_URL='http://127.0.0.1:4567';window.DOMINO_PLATFORM_API_URL='http://127.0.0.1:4300/api';</script>`));
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
 }catch(e){res.writeHead(404);res.end('Not found');}
}).listen(4174,'127.0.0.1',()=>console.log('Audit local preview: 127.0.0.1:4174'));
