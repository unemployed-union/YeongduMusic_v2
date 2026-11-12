const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sourceMapSources } = require('./source-map-sources.cjs');

const project = path.resolve(process.argv[2]);
const mapPath = path.resolve(process.argv[3]);
let checked = 0;
let routes = 0;
for (const { source, content } of sourceMapSources(JSON.parse(fs.readFileSync(mapPath, 'utf8')))) {
  if (source.includes('node_modules')) {
    continue;
  }
  if (source.includes('?ctx=')) {
    continue;
  }
  // Expo's map paths are relative to the project root and begin with a slash.
  const local = source.startsWith('/src/') ? path.join(project, source) : source;
  if (!source.includes('/src/')) {
    continue;
  }
  assert(local.startsWith(project + '/src/'), 'Mixed preview source root: ' + source);
  assert.equal(content, fs.readFileSync(local, 'utf8'), 'Stale preview source: ' + source);
  checked++;
  if (source.includes('/src/app/')) {
    routes++;
  }
}
assert(routes > 0 && checked > 0, 'Expected application routes and source contents in map');
console.log(`PASS: ${checked} preview source files including ${routes} routes match ${project}`);
