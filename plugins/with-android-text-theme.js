const { AndroidConfig, withAndroidStyles, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function withAndroidTextTheme(config) {
  config = withDangerousMod(config, ['android', async (mod) => {
    const fontDir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/font');
    await fs.mkdir(fontDir, { recursive: true });
    // The platform TextView needs android:font attributes. Reuse expo-font's bundled TTF.
    await fs.writeFile(path.join(fontDir, 'app_text_font.xml'), `<?xml version="1.0" encoding="utf-8"?>
<font-family xmlns:android="http://schemas.android.com/apk/res/android">
  <font android:font="@font/pretendard_jp_variable" android:fontWeight="400" android:fontStyle="normal" android:fontVariationSettings="'wght' 400" />
  <font android:font="@font/pretendard_jp_variable" android:fontWeight="700" android:fontStyle="normal" android:fontVariationSettings="'wght' 700" />
</font-family>
`);
    return mod;
  }]);

  return withAndroidStyles(config, (mod) => {
    for (const name of ['android:fontFamily', 'fontFamily']) {
      mod.modResults = AndroidConfig.Styles.assignStylesValue(mod.modResults, {
        add: true,
        parent: AndroidConfig.Styles.getAppThemeGroup(),
        name,
        value: '@font/app_text_font',
      });
    }
    return mod;
  });
};
