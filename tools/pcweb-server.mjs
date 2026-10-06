// Kleiner Webserver für die Spiel-Fassung auf dem Windows-PC (tools/pcweb.sh lädt ihn hoch).
// Liefert nur die Dateien eines entpackten Release-Ordners aus, nichts sonst. Aufruf:
//   node pcweb-server.mjs <ordner> [port]
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const port = Number(process.argv[3] ?? 8080);
const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

createServer((req, res) => {
  const pfad = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const datei = normalize(join(root, pfad === '/' ? 'index.html' : pfad));
  if (!datei.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (!statSync(datei).isFile()) throw new Error('kein File');
  } catch {
    res.writeHead(404).end('nicht gefunden');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPEN[extname(datei)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  createReadStream(datei).pipe(res);
}).listen(port, '0.0.0.0', () => console.log(`CRUDE ${root} auf Port ${port}`));
