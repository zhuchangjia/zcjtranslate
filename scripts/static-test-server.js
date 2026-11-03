const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".onnx": "application/octet-stream", ".spm": "application/octet-stream" };
http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const filename = path.resolve(root, "." + pathname);
  if (!filename.startsWith(root)) { response.writeHead(403).end(); return; }
  fs.stat(filename, (error, stat) => {
    if (error || !stat.isFile()) { response.writeHead(404).end("not found"); return; }
    response.writeHead(200, { "Content-Type": types[path.extname(filename)] || "application/octet-stream", "Content-Length": stat.size });
    fs.createReadStream(filename).pipe(response);
  });
}).listen(18765, "127.0.0.1", () => console.log("OPUS test server: http://127.0.0.1:18765"));
