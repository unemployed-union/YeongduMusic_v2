require 'fileutils'
begin
  require 'xcodeproj'
rescue LoadError
  $LOAD_PATH.unshift(*Dir.glob('/opt/homebrew/Cellar/cocoapods/*/libexec/gems/*/lib'))
  require 'xcodeproj'
end

output = File.expand_path(ARGV.fetch(0, '/tmp/yeongdu-search-ui-tests'))
FileUtils.mkdir_p(output)
FileUtils.cp(File.join(__dir__, 'SearchUITests.swift'), File.join(output, 'SearchUITests.swift'))
project = Xcodeproj::Project.new(File.join(output, 'SearchUITests.xcodeproj'))
target = project.new_target(:ui_test_bundle, 'SearchUITests', :ios, '16.4')
target.source_build_phase.add_file_reference(project.main_group.new_file('SearchUITests.swift'))
target.build_configurations.each do |config|
  config.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'xyz.yeongdu.search-ui-tests',
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
scheme.save_as(project.path, 'SearchUITests', true)
puts project.path
