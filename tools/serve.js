/* Vista previa local. Uso: node tools/serve.js  →  http://localhost:8137 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 8137;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml",
  ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".webp": "image/webp"
};

http.createServer(function (req, res) {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("404"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
}).listen(PORT, function () {
  console.log("Vista previa en http://localhost:" + PORT);
});
