/* Real local modules with explicit native boundaries for standalone regression scripts. */
/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

exports.loadSource = function loadSource(file, mocks = {}, globals = {}, cache = new Map()) {
  const absolute = path.resolve(root, file);
  if (cache.has(absolute)) return cache.get(absolute);
  const exports = {};
  cache.set(absolute, exports);
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)(
    (name) => {
      if (name in mocks) return mocks[name];
      const local = name.startsWith('@/')
        ? path.join(root, 'src', name.slice(2))
        : name.startsWith('.')
          ? path.resolve(path.dirname(absolute), name)
          : null;
      if (!local) throw new Error('Unmocked native/package dependency: ' + name);
      const resolved = [local + '.ts', local + '.tsx', local + '.json'].find((candidate) =>
        fs.existsSync(candidate),
      );
      if (!resolved) throw new Error('Unresolved source dependency: ' + name);
      return resolved.endsWith('.json')
        ? JSON.parse(fs.readFileSync(resolved, 'utf8'))
        : loadSource(resolved, mocks, globals, cache);
    },
    exports,
    ...Object.values(globals),
  );
  return exports;
};
