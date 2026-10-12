Add-Type -AssemblyName System.IO.Compression
$auditDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) '.expo'
$inventory = Get-Content -Raw -Encoding utf8 (Join-Path $auditDirectory 'license-inventory.json') | ConvertFrom-Json
$results = @()
function Read-Notices($stream, $prefix) {
  $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Read, $true)
  try {
    foreach ($entry in $archive.Entries) {
      if ($entry.FullName -match '(?i)(^|/)([^/]*license[^/]*|[^/]*notice[^/]*|copying[^/]*)$' -and $entry.Length -gt 0 -and $entry.Length -lt 2000000 -and $entry.FullName -notmatch '\.(class|so)$') {
        $reader = [System.IO.StreamReader]::new($entry.Open())
        try { [pscustomobject]@{ file = "$prefix/$($entry.FullName)"; text = $reader.ReadToEnd() } } finally { $reader.Dispose() }
      } elseif ($entry.FullName -eq 'classes.jar') {
        $memory = [System.IO.MemoryStream]::new()
        $source = $entry.Open()
        try { $source.CopyTo($memory); $memory.Position = 0; Read-Notices $memory "$prefix/classes.jar" } finally { $source.Dispose(); $memory.Dispose() }
      }
    }
  } finally { $archive.Dispose() }
}
foreach ($native in $inventory.natives) {
  $notices = @()
  foreach ($file in $native.files) {
    if ($file -notmatch '\.(jar|aar)$') { continue }
    $stream = [System.IO.File]::OpenRead($file)
    try { $notices += @(Read-Notices $stream ([System.IO.Path]::GetFileName($file))) } finally { $stream.Dispose() }
  }
  $results += [pscustomobject]@{ name = $native.name; version = $native.version; notices = $notices }
}
$results | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 (Join-Path $auditDirectory 'native-notices.json')
$results | Where-Object { $_.notices.Count -gt 0 } | ForEach-Object { Write-Output "$($_.name): $($_.notices.file -join ', ')" }
