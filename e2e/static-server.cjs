const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);

const contentTypes = new Map([
    [".html", "text/html; charset=utf-8"],
    [".css", "text/css; charset=utf-8"],
    [".js", "application/javascript; charset=utf-8"],
    [".cjs", "application/javascript; charset=utf-8"],
    [".mjs", "application/javascript; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".svg", "image/svg+xml"],
    [".png", "image/png"],
    [".ico", "image/x-icon"],
    [".webmanifest", "application/manifest+json; charset=utf-8"]
]);

async function readFileSafe(filePath) {
    try {
        return await fs.readFile(filePath);
    } catch {
        return null;
    }
}

const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    let pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname === "/") pathname = "/index.html";
    const filePath = path.normalize(path.join(root, pathname));
    if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    let finalPath = filePath;
    let body = await readFileSafe(finalPath);
    if (!body) {
        res.writeHead(404);
        res.end("Not found");
        return;
    }

    const ext = path.extname(finalPath).toLowerCase();
    res.writeHead(200, {
        "Content-Type": contentTypes.get(ext) || "application/octet-stream",
        "Cache-Control": "no-store"
    });
    res.end(body);
});

server.listen(port, "127.0.0.1", () => {
    console.log(`Static server listening on http://127.0.0.1:${port}`);
});
