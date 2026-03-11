import http from "http";
import fs from "fs";
import path from "path";

const PORT = 3000;
const ROOT = process.cwd();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function codespacesUrl(port) {
  const name = process.env.CODESPACE_NAME;
  const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (!name || !domain) return null;
  return `https://${name}-${port}.${domain}/site/inspect.html`;
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const requested = (urlPath === "/" || urlPath === "/site" || urlPath === "/site/") ? "/site/inspect.html" : urlPath;
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const requested = urlPath === "/" ? "/site/inspect.html" : urlPath;

  if (!requested.startsWith("/site/") && !requested.startsWith("/runs/")) {
    return send(res, 403, "Only /site/* and /runs/* are served.");
  }

  const fullPath = path.resolve(ROOT, `.${requested}`);
  const allowedRoot = path.resolve(ROOT);
  if (!fullPath.startsWith(allowedRoot)) {
    return send(res, 403, "Forbidden path");
  }

  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    return send(res, 404, "Not found");
  }

  const ext = path.extname(fullPath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  send(res, 200, fs.readFileSync(fullPath), mime);
});

server.listen(PORT, "0.0.0.0", () => {
  const local = `http://localhost:${PORT}/site/inspect.html`;
  const remote = codespacesUrl(PORT);
  console.log(`Inspector server running. Open ${local}`);
  if (remote) {
    console.log(`Codespaces URL: ${remote}`);
  }
  console.log(`Inspector server running on http://localhost:${PORT}/site/inspect.html`);
});
