param(
  [string]$SdkRoot = $env:ANDROID_HOME,
  [string]$JavaHome = $env:JAVA_HOME,
  [string]$Keystore,
  [switch]$BuildOnly
)
$ErrorActionPreference = 'Stop'
$sourceDir = Split-Path -Parent $PSCommandPath
$projectRoot = (Resolve-Path (Join-Path $sourceDir '../../..')).Path
if (-not $SdkRoot) { $SdkRoot = $env:ANDROID_SDK_ROOT }
if (-not $SdkRoot) { $SdkRoot = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$sdkTools = Get-ChildItem -LiteralPath (Join-Path $SdkRoot 'build-tools') -Directory |
  Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } |
  Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1 -ExpandProperty FullName
$sdkPlatform = Join-Path $SdkRoot 'platforms/android-36/android.jar'
if (-not $sdkTools -or -not (Test-Path -LiteralPath $sdkPlatform)) { throw 'Install Android SDK Platform 36 and build-tools.' }
if (-not $JavaHome) { $JavaHome = Split-Path -Parent (Split-Path -Parent (Get-Command javac.exe -ErrorAction Stop).Source) }
$javaTools = Join-Path $JavaHome 'bin'
# Build products belong in a unique temporary directory, never in the source tree.
$outputDir = Join-Path ([System.IO.Path]::GetTempPath()) ('yeongdu-cover-probe-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $outputDir | Out-Null
& "$javaTools/javac.exe" -cp $sdkPlatform -d $outputDir (Join-Path $sourceDir 'Probe.java')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& "$sdkTools/d8.bat" --lib $sdkPlatform --output $outputDir (Join-Path $outputDir 'xyz/yeongdu/coverprobe/Probe.class')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$unsignedApk = Join-Path $outputDir 'probe-unsigned.apk'
& "$sdkTools/aapt2.exe" link -I $sdkPlatform --manifest (Join-Path $sourceDir 'AndroidManifest.xml') -o $unsignedApk
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& "$javaTools/jar.exe" uf $unsignedApk -C $outputDir classes.dex
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($BuildOnly) { Write-Output "Built diagnostic APK: $unsignedApk"; exit 0 }
if (-not $Keystore) { $Keystore = Join-Path $projectRoot 'android/app/debug.keystore' }
if (-not (Test-Path -LiteralPath $Keystore)) { throw 'Pass -Keystore with an Android debug keystore (androiddebugkey / android).' }
$signedApk = Join-Path $outputDir 'probe.apk'
& "$sdkTools/apksigner.bat" sign --ks $Keystore --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey --out $signedApk $unsignedApk
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$adb = Join-Path $SdkRoot 'platform-tools/adb.exe'
& $adb install -r $signedApk
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $adb shell am instrument -w xyz.yeongdu.coverprobe/.Probe
