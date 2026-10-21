// Loopback-only synthetic preview for R-15/R-19, separate from the Play app.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd(), port = 4186;
if (JSON.parse(await fs.readFile('package.json', 'utf8')).name !== 'domino2') throw Error('Run from Domino root');
const mime = { '.html':'text/html', '.js':'application/javascript', '.cjs':'application/javascript', '.css':'text/css', '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.mp3':'audio/mpeg', '.webm':'video/webm' };
const injection = `<meta name="domino-local-review" content="s039"><meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:${port}; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'"><script>window.DOMINO_ENDPOINTS={API_BASE:'http://127.0.0.1:${port}/api',GAME_HTTP_BASE:'http://127.0.0.1:${port}',GAME_WS_URL:'ws://127.0.0.1:${port}'};window.DOMINO_PLATFORM_API_URL='http://127.0.0.1:${port}/api';window.DOMINO_SERVER_URL='http://127.0.0.1:${port}';if(!localStorage.getItem('domino-lang'))localStorage.setItem('domino-lang','ru');</script><script type="module" src="/review/board-test.js"></script><script type="module" src="/review/review-entry.js"></script>`;
const server = http.createServer(async (req,res) => {
    try {
        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        if (['https://localhost',`http://127.0.0.1:${port}`].includes(req.headers.origin)) {
            res.setHeader('Access-Control-Allow-Origin',req.headers.origin);
            res.setHeader('Access-Control-Allow-Credentials','true');
            res.setHeader('Vary','Origin');
            res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Requested-With');
            if(req.headers['access-control-request-private-network']==='true') res.setHeader('Access-Control-Allow-Private-Network','true');
        }
        if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
        if (url.pathname.startsWith('/api/')) {
            res.writeHead(200, {'Content-Type':'application/json'});
            // Guest only: no real auth, game server or economy service is connected.
            res.end(JSON.stringify({items:[],incoming:[],accepted:[],rooms:[],counts:{},unreadCount:0})); return;
        }
        const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
        if (!/^\/(?:index\.html|review-audio\.html|review\/|js\/|css\/|shared\/|assets\/|favicon|manifest)/.test(pathname)) throw Error('outside preview scope');
        const mapped = pathname === '/review-audio.html' ? '/docs/remediation/review/audio.html' : pathname.startsWith('/review/') ? '/docs/remediation/review/' + pathname.slice(8) : pathname;
        const file = path.resolve(root, '.' + mapped);
        if (!file.startsWith(root + path.sep) || pathname.split('/').some(part => part.startsWith('.'))) throw Error('outside preview root');
        let bytes = await fs.readFile(file);
        if (file.endsWith('.html')) bytes = Buffer.from(bytes.toString().replace('<head>', '<head>' + injection));
        res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'}); res.end(bytes);
    } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port,'127.0.0.1',()=>console.log(`Synthetic guest preview on127.0.0.1:${port}; no production requests allowed by CSP`));
process.once('SIGTERM',()=>server.close());
