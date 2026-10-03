// Tester-Build (Schritt 1.16): baut das Spiel und packt dist/ als ZIP nach
// release/crude-<version>.zip – index.html liegt im Wurzelverzeichnis des ZIPs,
// so wie itch.io es für HTML-Spiele verlangt.
// Aufruf: npm run release
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const releaseDir = fileURLToPath(new URL('../release/', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function fail(message) {
  console.error(`\nRelease abgebrochen: ${message}`);
  process.exit(1);
}

// 1. Bauen (prüft vorher die Typen).
execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });

// 2. Prüfen: index.html da, alle Pfade relativ (sonst lädt itch.io im Unterpfad nichts).
const indexPath = new URL('../dist/index.html', import.meta.url);
if (!existsSync(indexPath)) fail('dist/index.html fehlt.');
const html = readFileSync(indexPath, 'utf8');
const absolut = html.match(/(?:src|href)="\/[^"]*"/g);
if (absolut) fail(`dist/index.html enthält absolute Pfade: ${absolut.join(', ')}`);

// 3. Packen: aus dist/ heraus, damit index.html ganz oben im ZIP liegt.
mkdirSync(releaseDir, { recursive: true });
const zipName = `crude-${version}.zip`;
const zipPath = fileURLToPath(new URL(`../release/${zipName}`, import.meta.url));
rmSync(zipPath, { force: true });
try {
  execFileSync('zip', ['-r', '-X', '-q', zipPath, '.', '-x', '.DS_Store', '*/.DS_Store'], { cwd: dist, stdio: 'inherit' });
} catch {
  fail('Das Programm „zip“ ist nicht verfügbar oder ist gescheitert.');
}

// 4. Gegenprobe: Inhalt des ZIPs auflisten.
const liste = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split('\n').filter(Boolean);
if (!liste.includes('index.html')) fail('index.html liegt nicht im Wurzelverzeichnis des ZIPs.');

console.log(`\nFertig: release/${zipName} (${liste.length} Dateien, index.html im Wurzelverzeichnis)`);
console.log('Hochladen auf itch.io: siehe docs/tester-anleitung.md');
