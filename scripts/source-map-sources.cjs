/** Iterate both ordinary source maps and SDK 58 Metro's indexed maps. */
exports.sourceMapSources = function* sourceMapSources(map) {
  if (Array.isArray(map.sections)) {
    for (const section of map.sections) {
      if (!section.map) {
        throw new Error('Expected an inline map in the exported source-map section.');
      }
      yield* sourceMapSources(section.map);
    }
    return;
  }
  if (!Array.isArray(map.sources)) {
    throw new Error('The exported source map has no sources.');
  }
  for (let index = 0; index < map.sources.length; index++) {
    yield { source: map.sources[index], content: map.sourcesContent?.[index] };
  }
};
