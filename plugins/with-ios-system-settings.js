const fs = require('node:fs/promises');
const path = require('node:path');
const { withAppDelegate, withDangerousMod, withXcodeProject, IOSConfig } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');
const plist = require('@expo/plist').default;
const schema = require('../src/features/settings/ios-settings-schema.json');

function settingsPages() {
  const pages = {};
  const root = [];
  for (const group of schema.groups) {
    const rows = [{ Type: 'PSGroupSpecifier', Title: group.title, ...(group.footer && { FooterText: group.footer }) }];
    for (const item of group.items) rows.push({
      Type: item.type === 'choice' ? 'PSMultiValueSpecifier' : item.type === 'slider' ? 'PSSliderSpecifier' : 'PSToggleSwitchSpecifier',
      Title: item.title, Key: item.key, DefaultValue: item.default,
      ...(item.type === 'choice' && { Values: item.values, Titles: item.titles }),
      ...(item.type === 'slider' && { MinimumValue: 1, MaximumValue: 100 }),
    });
    if (group.page) {
      root.push({ Type: 'PSChildPaneSpecifier', Title: group.title, File: group.page });
      pages[group.page] = { PreferenceSpecifiers: rows };
    } else root.push(...rows);
  }
  pages.Root = { PreferenceSpecifiers: root };
  return pages;
}

function withIosSystemSettings(config) {
  config = withDangerousMod(config, ['ios', async mod => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    const directory = path.join(mod.modRequest.platformProjectRoot, projectName, 'Settings.bundle');
    await fs.mkdir(directory, { recursive: true });
    for (const [name, page] of Object.entries(settingsPages())) await fs.writeFile(path.join(directory, `${name}.plist`), plist.build(page));
    return mod;
  }]);
  config = withXcodeProject(config, mod => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    IOSConfig.XcodeUtils.addResourceFileToGroup({ filepath: `${projectName}/Settings.bundle`, groupName: projectName, project: mod.modResults, isBuildFile: true });
    return mod;
  });
  return withAppDelegate(config, mod => {
    if (mod.modResults.language !== 'swift') throw new Error('YeongduMusic Settings.bundle requires the Expo Swift AppDelegate.');
    mod.modResults.contents = mergeContents({
      src: mod.modResults.contents, tag: 'yeongdu-system-settings', anchor: /let delegate = ReactNativeDelegate\(\)/, offset: 0, comment: '//',
      newSrc: '    if Bundle.main.url(forResource: "Settings", withExtension: "bundle") != nil {\n      UserDefaults.standard.register(defaults: ["ym_settings_bundle_version": 1])\n    }',
    }).contents;
    return mod;
  });
}
module.exports = withIosSystemSettings;
module.exports.settingsPages = settingsPages;
