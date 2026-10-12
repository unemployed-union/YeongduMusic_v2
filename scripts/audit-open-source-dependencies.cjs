/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
function walk(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]) : []; }
const packages = new Map();
const maps = walk(path.join(root,'.expo/license-audit')).filter(f => f.endsWith('.map'));
for (const map of maps) for (const source of JSON.parse(fs.readFileSync(map)).sources) {
  const normalized = source.replaceAll('\\','/');
  const at = normalized.lastIndexOf('node_modules/');
  if (at < 0) continue;
  const rest = normalized.slice(at + 13).split('/');
  const name = rest[0].startsWith('@') ? rest.slice(0,2).join('/') : rest[0];
  let dir = path.resolve(root, normalized.slice(0, at + 13) + name);
  if (!fs.existsSync(path.join(dir,'package.json'))) dir = path.join(root,'node_modules',name);
  if (!fs.existsSync(path.join(dir,'package.json'))) throw new Error(dir);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir,'package.json')));
  packages.set(pkg.name+'@'+pkg.version, { name: pkg.name, version: pkg.version, license: pkg.license, dir,
    files: fs.readdirSync(dir).filter(f=>/^(license|licence|notice|copying)([.-]|$)/i.test(f)) });
}
const reportBytes=fs.readFileSync(path.join(root,'.expo/license-gradle-dependencies.txt'));
const report=reportBytes.toString(reportBytes[0]===255 ? 'utf16le':'utf8');
const coordinates=new Map();
for (const match of report.matchAll(/(?:[+\\]---|\s)([\w.-]+):([\w.-]+):([^\s]+)(?: -> ([^\s]+))?/g)) {
  let [group,artifact,version]=match.slice(1,4);
  if(match[4]) { if(match[4].includes(':')) [group,artifact,version]=match[4].split(':'); else version=match[4]; }
  coordinates.set(group+':'+artifact,{group,artifact,version});
}
const natives=[...coordinates.values()].map(({group,artifact,version})=>{
  const dir=path.join(os.homedir(),'.gradle/caches/modules-2/files-2.1',group,artifact,version);
  const files=walk(dir),pom=files.find(f=>f.endsWith('.pom'));
  const text=pom ? fs.readFileSync(pom,'utf8') : '';
  return { name:group+':'+artifact,version,license:text.match(/<licenses>([\s\S]*?)<\/licenses>/)?.[1].replace(/\s+/g,' ').trim(),files };
}).filter(n=>n.files.some(f=>/\.(aar|jar)$/.test(f)));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n')).digest('hex');
fs.writeFileSync(path.join(root,'.expo/license-inventory.json'),JSON.stringify({packageLockSha256:sha('pnpm-lock.yaml'),packageJsonSha256:sha('package.json'),packages:[...packages.values()].sort((a,b)=>a.name.localeCompare(b.name)),natives},null,2));
console.log('JS packages:',packages.size,'Native artifacts:',natives.length);
console.log('Missing JS license files:',[...packages.values()].filter(p=>!p.files.length).map(p=>p.name));
