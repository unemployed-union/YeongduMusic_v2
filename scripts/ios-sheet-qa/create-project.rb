require 'fileutils'
begin
  require 'xcodeproj'
rescue LoadError
  # Homebrew CocoaPods carries xcodeproj without exposing it to the system Ruby.
  $LOAD_PATH.unshift(*Dir.glob('/opt/homebrew/Cellar/cocoapods/*/libexec/gems/*/lib'))
  require 'xcodeproj'
end

output = File.expand_path(ARGV.fetch(0, '/tmp/yeongdu-sheet-ui-tests'))
FileUtils.mkdir_p(output)
FileUtils.cp(File.join(__dir__, 'SheetUITests.swift'), File.join(output, 'SheetUITests.swift'))
project = Xcodeproj::Project.new(File.join(output, 'SheetUITests.xcodeproj'))
target = project.new_target(:ui_test_bundle, 'SheetUITests', :ios, '26.0')
target.source_build_phase.add_file_reference(project.main_group.new_file('SheetUITests.swift'))
target.build_configurations.each do |config|
  config.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'xyz.yeongdu.sheet-ui-tests',
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'SWIFT_VERSION' => '5.9',
    'TEST_TARGET_NAME' => '',
    'CODE_SIGNING_ALLOWED' => 'NO'
  })
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(target)
scheme.add_test_target(target)
scheme.save_as(project.path, 'SheetUITests', true)
puts project.path
