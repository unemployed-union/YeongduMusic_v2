require 'fileutils'
$LOAD_PATH.unshift(*Dir.glob('/opt/homebrew/Cellar/cocoapods/*/libexec/gems/*/lib'))
require 'xcodeproj'
output = File.expand_path(__dir__)
project = Xcodeproj::Project.new(File.join(output, 'Probe.xcodeproj'))
app = project.new_target(:application, 'MaterialProbe', :ios, '26.1')
app.source_build_phase.add_file_reference(project.main_group.new_file('Probe.swift'))
# Frozen reference implementation: never part of the production app.
root = File.join(__dir__, 'native')
['SettingsGroupBackground.swift', 'SheetAppearancePolicy.swift'].each do |name|
  app.source_build_phase.add_file_reference(project.main_group.new_file(File.join(root, name)))
end
ui = project.new_target(:ui_test_bundle, 'ProbeTests', :ios, '26.1')
ui.source_build_phase.add_file_reference(project.main_group.new_file('ProbeTests.swift'))
ui.add_dependency(app)
[[app, 'xyz.yeongdu.material-probe'], [ui, 'xyz.yeongdu.material-probe.tests']].each do |target, identifier|
  target.build_configurations.each do |config|
    config.build_settings.merge!({ 'PRODUCT_BUNDLE_IDENTIFIER' => identifier,
      'GENERATE_INFOPLIST_FILE' => 'YES', 'SWIFT_VERSION' => '5.9',
      'CODE_SIGNING_ALLOWED' => 'NO', 'TARGETED_DEVICE_FAMILY' => '1,2' })
  end
end
app.build_configurations.each do |config|
  config.build_settings['INFOPLIST_KEY_UILaunchScreen_Generation'] = 'YES'
  config.build_settings['INFOPLIST_KEY_UIApplicationSceneManifest_Generation'] = 'YES'
end
ui.build_configurations.each { |config| config.build_settings['TEST_TARGET_NAME'] = 'MaterialProbe' }
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.add_build_target(ui)
scheme.add_test_target(ui)
scheme.save_as(project.path, 'MaterialProbe', true)
