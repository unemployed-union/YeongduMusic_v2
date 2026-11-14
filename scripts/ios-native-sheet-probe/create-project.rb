require 'fileutils'
$LOAD_PATH.unshift(*Dir.glob('/opt/homebrew/Cellar/cocoapods/*/libexec/gems/*/lib'))
require 'xcodeproj'
output = File.expand_path(ARGV.fetch(0, '/tmp/yeongdu-native-sheet-probe'))
FileUtils.mkdir_p(output)
%w[Probe.swift ProbeTests.swift].each do |name|
  FileUtils.cp(File.join(__dir__, name), File.join(output, name))
end
project = Xcodeproj::Project.new(File.join(output, 'Probe.xcodeproj'))
app = project.new_target(:application, 'NativeSheetProbe', :ios, '16.4')
app.source_build_phase.add_file_reference(project.main_group.new_file('Probe.swift'))
ui = project.new_target(:ui_test_bundle, 'ProbeTests', :ios, '16.4')
ui.source_build_phase.add_file_reference(project.main_group.new_file('ProbeTests.swift'))
ui.add_dependency(app)
[[app, 'xyz.yeongdu.native-sheet-probe'], [ui, 'xyz.yeongdu.native-sheet-probe.tests']].each do |target, identifier|
  target.build_configurations.each do |config|
    config.build_settings.merge!({
      'PRODUCT_BUNDLE_IDENTIFIER' => identifier,
      'GENERATE_INFOPLIST_FILE' => 'YES',
      'SWIFT_VERSION' => '5.9',
      'CODE_SIGNING_ALLOWED' => 'NO',
      'TARGETED_DEVICE_FAMILY' => '1,2'
    })
  end
end
app.build_configurations.each do |config|
  config.build_settings['INFOPLIST_KEY_UILaunchScreen_Generation'] = 'YES'
  config.build_settings['INFOPLIST_KEY_UIApplicationSceneManifest_Generation'] = 'YES'
end
ui.build_configurations.each { |config| config.build_settings['TEST_TARGET_NAME'] = 'NativeSheetProbe' }
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.add_build_target(ui)
scheme.add_test_target(ui)
scheme.save_as(project.path, 'NativeSheetProbe', true)
puts project.path
