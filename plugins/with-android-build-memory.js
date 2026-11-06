const { withGradleProperties } = require('expo/config-plugins');

/** Preserve the build memory limits from the SDK 57 native project after prebuild. */
module.exports = function withAndroidBuildMemory(config) {
  return withGradleProperties(config, (mod) => {
    const key = 'org.gradle.jvmargs';
    const value = '-Xmx4g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';
    const property = mod.modResults.find((item) => item.type === 'property' && item.key === key);
    if (property) {
      property.value = value;
    } else {
      mod.modResults.push({ type: 'property', key, value });
    }
    return mod;
  });
};
