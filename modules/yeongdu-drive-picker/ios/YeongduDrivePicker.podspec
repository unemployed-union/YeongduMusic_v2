Pod::Spec.new do |s|
  s.name = 'YeongduDrivePicker'
  s.version = '1.0.0'
  s.summary = 'Google Drive file selection for YeongduMusic'
  s.description = s.summary
  s.license = 'MIT'
  s.author = 'Yeongdu'
  s.homepage = 'https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker'
  s.source = { :git => 'https://github.com/expo/expo.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.frameworks = 'AuthenticationServices', 'CryptoKit'
end
