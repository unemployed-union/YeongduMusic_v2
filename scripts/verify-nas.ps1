param(
  [Parameter(Mandatory = $true)][string]$BaseUrl,
  [string]$Account,
  [switch]$ApiOnly,
  [switch]$LibraryOnly,
  [switch]$LyricsOnly,
  [switch]$QualityOnly
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$base = $BaseUrl.TrimEnd('/')
if (-not $base.StartsWith('https://', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Use an HTTPS URL with a trusted certificate for authenticated tests.'
}
$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(15)
$sid = $null
$token = $null
$apis = $null
$preferred = @{
  'SYNO.API.Auth' = 6
  'SYNO.AudioStation.Song' = 3
  'SYNO.AudioStation.Album' = 3
  'SYNO.AudioStation.Artist' = 4
  'SYNO.AudioStation.Cover' = 3
  'SYNO.AudioStation.Stream' = 2
}

function QueryString([hashtable]$values) {
  return (($values.GetEnumerator() | ForEach-Object {
    [uri]::EscapeDataString([string]$_.Key) + '=' + [uri]::EscapeDataString([string]$_.Value)
  }) -join '&')
}

function ApiUrl([string]$name, [string]$method, [hashtable]$parameters, [string]$pathSuffix = '') {
  $info = $script:apis.$name
  if (-not $info) { throw "Missing API: $name" }
  $version = [Math]::Min([int]$script:preferred[$name], [int]$info.maxVersion)
  if ($version -lt [int]$info.minVersion) { throw "Unsupported API version: $name" }
  $query = @{ api = $name; version = $version; method = $method }
  if ($script:sid) { $query['_sid'] = $script:sid }
  if ($script:token) { $query['SynoToken'] = $script:token }
  foreach ($key in $parameters.Keys) { $query[$key] = $parameters[$key] }
  return "$script:base/webapi/$($info.path)$($pathSuffix)?$(QueryString $query)"
}

function GetJson([string]$url) {
  $response = $script:client.GetAsync($url).GetAwaiter().GetResult()
  try {
    $type = [string]$response.Content.Headers.ContentType
    if ($type -match 'text/html') { throw "HTML response: HTTP $([int]$response.StatusCode), Content-Type $type" }
    $bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    $raw = [System.Text.Encoding]::UTF8.GetString($bytes)
    try { return $raw | ConvertFrom-Json }
    catch { throw "Non-JSON response: HTTP $([int]$response.StatusCode), Content-Type $type" }
  } finally { $response.Dispose() }
}

function ProbeList([string]$name, [string]$method, [string]$key, [hashtable]$parameters) {
  try {
    $result = GetJson (ApiUrl $name $method $parameters)
    if ($result.success -ne $true) {
      Write-Host "$name.$method API error code=$($result.error.code)"
      return $null
    }
    $items = $result.data.$key
    if ($null -eq $items) {
      Write-Host "$name.$method returned data keys: $(@($result.data.PSObject.Properties.Name) -join ',')"
      return $null
    }
    $first = @($items) | Select-Object -First 1
    Write-Host "$name.$method success; count=$(@($items).Count); total=$($result.data.total); fields=$(@($first.PSObject.Properties.Name) -join ',')"
    if ($first -and $first.additional) {
      Write-Host "$name.$method additionalKeys=$(@($first.additional.PSObject.Properties.Name) -join ',')"
      if ($first.additional.song_tag) { Write-Host "$name.$method songTagFields=$(@($first.additional.song_tag.PSObject.Properties.Name) -join ',')" }
    }
    return $first
  } catch {
    Write-Host "$name.$method failed: $($_.Exception.GetType().Name)"
    return $null
  }
}

function ProbeBinary([string]$name, [string]$method, [hashtable]$parameters, [string]$pathSuffix = '') {
  $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, (ApiUrl $name $method $parameters $pathSuffix))
  $request.Headers.Range = [System.Net.Http.Headers.RangeHeaderValue]::new(0, 1023)
  try {
    $response = $script:client.SendAsync($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
    try {
      $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
      try {
        $buffer = New-Object byte[] 1024
        $read = $stream.Read($buffer, 0, $buffer.Length)
        $range = [string]$response.Content.Headers.ContentRange
        $length = [string]$response.Content.Headers.ContentLength
        $type = [string]$response.Content.Headers.ContentType
        $chunked = [string]$response.Headers.TransferEncodingChunked
        Write-Output "$name.$method HTTP=$([int]$response.StatusCode) type=$type length=$length chunked=$chunked range=$range bytesRead=$read"
        if ($type -match 'json|text/plain') {
          try {
            $payload = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $read) | ConvertFrom-Json
            if ($payload.success -eq $false) { Write-Output "$name.$method API error code=$($payload.error.code)" }
          } catch { Write-Output "$name.$method text response could not be parsed from the first 1 KiB." }
        }
      } finally { $stream.Dispose() }
    } finally { $response.Dispose() }
  } catch {
    Write-Output "$name.$method failed: $($_.Exception.GetType().Name)"
  } finally { $request.Dispose() }
}

function InvokeNasLogin([System.Security.SecureString]$secret, [System.Security.SecureString]$otpSecret) {
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  try { $passwordValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
  $parameters = @{ api = 'SYNO.API.Auth'; version = $script:authVersion; method = 'login'; account = $script:Account; passwd = $passwordValue; session = 'AudioStation'; format = 'sid'; enable_syno_token = 'yes' }
  if ($otpSecret) {
    $otpPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($otpSecret)
    try { $otpValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($otpPointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($otpPointer) }
    $parameters['otp_code'] = $otpValue
  }
  $body = QueryString $parameters
  $passwordValue = $null
  $otpValue = $null
  $parameters.Clear()
  $content = [System.Net.Http.StringContent]::new($body, [System.Text.Encoding]::UTF8, 'application/x-www-form-urlencoded')
  $body = $null
  try {
    $response = $script:client.PostAsync("$script:base/webapi/$($script:auth.path)", $content).GetAwaiter().GetResult()
    try {
      $bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
      $raw = [System.Text.Encoding]::UTF8.GetString($bytes)
      return ($raw | ConvertFrom-Json)
    } finally { $response.Dispose() }
  } finally { $content.Dispose() }
}

try {
  $infoUrl = "$base/webapi/entry.cgi?api=SYNO.API.Info&version=1&method=query&query=SYNO.API.Auth,SYNO.AudioStation.Song,SYNO.AudioStation.Album,SYNO.AudioStation.Artist,SYNO.AudioStation.Cover,SYNO.AudioStation.Stream"
  if ($LyricsOnly) { $infoUrl += ',SYNO.AudioStation.Lyrics' }
  $discovery = GetJson $infoUrl
  if ($discovery.success -ne $true) { throw "API discovery failed: code=$($discovery.error.code)" }
  $apis = $discovery.data
  foreach ($name in $preferred.Keys) {
    $entry = $apis.$name
    if (-not $entry) { throw "Missing API: $name" }
    Write-Output "$name path=$($entry.path) versions=$($entry.minVersion)-$($entry.maxVersion)"
  }
  if ($ApiOnly) { return }

  if (-not $Account) { $Account = Read-Host 'NAS account' }
  $securePassword = Read-Host 'NAS password' -AsSecureString
  $auth = $apis.'SYNO.API.Auth'
  $authVersion = [Math]::Min(6, [int]$auth.maxVersion)
  try {
    $login = InvokeNasLogin $securePassword $null
    if ($login.success -ne $true -and @(403, 406) -contains [int]$login.error.code) {
      Write-Output 'Two-factor authentication required; enter the code locally.'
      $secureOtp = Read-Host 'NAS one-time authentication code' -AsSecureString
      try { $login = InvokeNasLogin $securePassword $secureOtp }
      finally { $secureOtp.Dispose() }
    }
  } finally { $securePassword.Dispose() }
  if ($login.success -ne $true) { throw "Login failed: DSM code=$($login.error.code)" }
  $sid = $login.data.sid
  $token = $login.data.synotoken
  if (-not $sid) { throw 'Login response has no session ID.' }
  Write-Output 'Login success (session value hidden).'

  if ($LyricsOnly) {
    $lyricsInfo = $apis.'SYNO.AudioStation.Lyrics'
    if (-not $lyricsInfo) { Write-Output 'Lyrics API not advertised by this NAS.'; return }
    Write-Output "SYNO.AudioStation.Lyrics path=$($lyricsInfo.path) versions=$($lyricsInfo.minVersion)-$($lyricsInfo.maxVersion)"
    $preferred['SYNO.AudioStation.Lyrics'] = 2
    $sample = GetJson (ApiUrl 'SYNO.AudioStation.Song' 'list' @{ offset = 0; limit = 5; library = 'all' })
    if ($sample.success -ne $true) { Write-Output "Song sample failed: code=$($sample.error.code)"; return }
    $sampleIndex = 0
    foreach ($sampleSong in @($sample.data.songs)) {
      $sampleIndex++
      # Read-only candidate probe. Its response must be verified before the
      # application can rely on this method/parameter contract.
      $result = GetJson (ApiUrl 'SYNO.AudioStation.Lyrics' 'getlyrics' @{ id = $sampleSong.id; library = 'all' })
      if ($result.success -ne $true) { Write-Output "Lyrics sample=$sampleIndex success=False errorCode=$($result.error.code)"; continue }
      Write-Output "Lyrics sample=$sampleIndex success=True dataFields=$(@($result.data.PSObject.Properties.Name) -join ',')"
      foreach ($property in $result.data.PSObject.Properties) {
        $value = $property.Value
        if ($value -is [string]) {
          $timestampCount = [regex]::Matches($value, '\[\d+:\d{2}(?:\.\d+)?\]').Count
          Write-Output "Lyrics field=$($property.Name) type=string length=$($value.Length) timestamps=$timestampCount"
        } elseif ($null -eq $value) {
          Write-Output "Lyrics field=$($property.Name) type=null"
        } else {
          Write-Output "Lyrics field=$($property.Name) type=$($value.GetType().Name) childFields=$(@($value.PSObject.Properties.Name) -join ',')"
        }
      }
    }
    return
  }

  if ($QualityOnly) {
    # Official Audio Station 6.5.7 audio-core.js uses transcode/format=mp3,
    # position=0 and a /0.mp3 path suffix. Verify this on the installed NAS.
    $sample = GetJson (ApiUrl 'SYNO.AudioStation.Song' 'list' @{ offset = 0; limit = 30; library = 'all' })
    if ($sample.success -ne $true) { Write-Output "Quality song sample failed: code=$($sample.error.code)"; return }
    $songs = @($sample.data.songs)
    $lossless = $songs | Where-Object { $_.path -match '\.(flac|alac|wav|aiff|ape)$' } | Select-Object -First 1
    $qualitySong = if ($lossless) { $lossless } else { $songs | Select-Object -First 1 }
    if (-not $qualitySong) { Write-Output 'Quality probe has no song to test.'; return }
    Write-Output "Quality sample losslessExtension=$([bool]$lossless) (song values hidden)"
    ProbeBinary 'SYNO.AudioStation.Stream' 'stream' @{ id = $qualitySong.id; library = 'all' }
    ProbeBinary 'SYNO.AudioStation.Stream' 'transcode' @{ id = $qualitySong.id; library = 'all'; format = 'mp3'; position = 0 } '/0.mp3'
    Write-Output 'Check MIME/HTTP results and actual device playback/seek; bitrate is not verified by this probe.'
    return
  }

  if ($LibraryOnly) {
    # Probe candidate library scopes; do not assume success means the NAS
    # honored a filter. Print totals, field names and overlap counts only.
    $scopeIds = @{}
    foreach ($scope in @('shared', 'personal', 'all')) {
      Write-Output "--- Library scope=$scope ---"
      try {
        $scoped = GetJson (ApiUrl 'SYNO.AudioStation.Song' 'list' @{ offset = 0; limit = 30; additional = 'song_tag'; library = $scope })
        if ($scoped.success -ne $true) {
          Write-Output "Song.list scope=$scope success=False errorCode=$($scoped.error.code)"
          continue
        }
        if ($null -eq $scoped.data.songs) { throw 'Song response has no songs array' }
        $songs = @($scoped.data.songs)
        $scopeIds[$scope] = @($songs | ForEach-Object { [string]$_.id })
        $firstSong = $songs | Select-Object -First 1
        Write-Output "Song.list scope=$scope success=True count=$($songs.Count) total=$($scoped.data.total) fields=$(@($firstSong.PSObject.Properties.Name) -join ',')"
        if ($firstSong -and $firstSong.library) {
          $reportedScope = if (@('shared', 'personal', 'all') -contains [string]$firstSong.library) { [string]$firstSong.library } else { 'other' }
          Write-Output "Song.list scope=$scope firstSongLibrary=$reportedScope"
        }
        $album = ProbeList 'SYNO.AudioStation.Album' 'list' 'albums' @{ offset = 0; limit = 1; library = $scope }
        $null = ProbeList 'SYNO.AudioStation.Artist' 'list' 'artists' @{ offset = 0; limit = 1; library = $scope }
        if ($firstSong) {
          $null = ProbeList 'SYNO.AudioStation.Song' 'search' 'songs' @{ keyword = $firstSong.title; offset = 0; limit = 1; additional = 'song_tag'; library = $scope }
          ProbeBinary 'SYNO.AudioStation.Cover' 'getsongcover' @{ id = $firstSong.id; size = 320; library = $scope }
          ProbeBinary 'SYNO.AudioStation.Stream' 'stream' @{ id = $firstSong.id; library = $scope }
        }
        if ($album -and $album.name) {
          $null = ProbeList 'SYNO.AudioStation.Song' 'list' 'songs' @{ album = $album.name; offset = 0; limit = 1; library = $scope }
        }
      } catch { Write-Output "Library scope=$scope failed: $($_.Exception.GetType().Name)" }
    }
    if ($scopeIds.ContainsKey('shared') -and $scopeIds.ContainsKey('personal') -and $scopeIds.ContainsKey('all')) {
      $sharedPersonalOverlap = @($scopeIds['personal'] | Where-Object { $scopeIds['shared'] -contains $_ }).Count
      $personalInAll = @($scopeIds['personal'] | Where-Object { $scopeIds['all'] -contains $_ }).Count
      $sharedInAll = @($scopeIds['shared'] | Where-Object { $scopeIds['all'] -contains $_ }).Count
      Write-Output "First-page ID overlap: shared-personal=$sharedPersonalOverlap personal-in-all=$personalInAll shared-in-all=$sharedInAll (sample up to 30; IDs hidden)"
    }
    return
  }


  $song = ProbeList 'SYNO.AudioStation.Song' 'list' 'songs' @{ offset = 0; limit = 1 }
  $null = ProbeList 'SYNO.AudioStation.Song' 'list' 'songs' @{ offset = 0; limit = 2 }
  $enrichedSong = ProbeList 'SYNO.AudioStation.Song' 'list' 'songs' @{ offset = 0; limit = 1; additional = 'song_tag' }
  if ($enrichedSong) { $song = $enrichedSong }
  $album = ProbeList 'SYNO.AudioStation.Album' 'list' 'albums' @{ offset = 0; limit = 1 }
  $null = ProbeList 'SYNO.AudioStation.Album' 'list' 'albums' @{ offset = 0; limit = 2 }
  $null = ProbeList 'SYNO.AudioStation.Artist' 'list' 'artists' @{ offset = 0; limit = 1 }
  $null = ProbeList 'SYNO.AudioStation.Artist' 'list' 'artists' @{ offset = 0; limit = 2 }
  if ($song -and $song.title) { $null = ProbeList 'SYNO.AudioStation.Song' 'search' 'songs' @{ keyword = $song.title; offset = 0; limit = 1; additional = 'song_tag' } }
  if ($album -and $album.name) { $null = ProbeList 'SYNO.AudioStation.Song' 'list' 'songs' @{ album = $album.name; offset = 0; limit = 1 } }
  if ($song -and $song.id) {
    ProbeBinary 'SYNO.AudioStation.Cover' 'getsongcover' @{ id = $song.id; size = 320 }
    ProbeBinary 'SYNO.AudioStation.Stream' 'stream' @{ id = $song.id }
  }
} catch {
  Write-Output "Verification stopped: $($_.Exception.GetType().Name): $($_.Exception.Message -replace 'https?://\S+', '[URL hidden]')"
  exit 1
} finally {
  if ($sid) {
    try {
      $logout = GetJson (ApiUrl 'SYNO.API.Auth' 'logout' @{ session = 'AudioStation' })
      Write-Output "Logout success=$($logout.success)."
      if ($logout.success -eq $true) {
        try {
          $expired = GetJson (ApiUrl 'SYNO.AudioStation.Song' 'list' @{ offset = 0; limit = 1 })
          Write-Output "Post-logout song request success=$($expired.success) errorCode=$($expired.error.code)"
        } catch { Write-Output "Post-logout request failed: $($_.Exception.GetType().Name)" }
      }
    }
    catch { Write-Output 'Logout request failed; let DSM expire this test session.' }
  }
  $client.Dispose()
}
