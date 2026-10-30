$ErrorActionPreference = 'Stop'
$browserDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$payload = Join-Path $browserDir 'dist/payload'
$manifest = Get-Content (Join-Path $browserDir 'package.json') -Raw | ConvertFrom-Json
$source = Join-Path $browserDir 'windows-launcher.cs'
$output = Join-Path $payload 'JUAI.exe'
$icon = (Resolve-Path (Join-Path $payload 'JUAI.ico')).Path
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (!(Test-Path $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework/v4.0.30319/csc.exe' }
if (!(Test-Path $compiler)) { throw 'Windows C# compiler was not found' }
& $compiler /nologo /target:winexe "/win32icon:$icon" "/out:$output" /reference:System.Windows.Forms.dll $source
if ($LASTEXITCODE -ne 0) { throw "Windows launcher compilation failed: $LASTEXITCODE" }
$folder = "JUAI-$($manifest.version)-windows-x64"
$portable = Join-Path $browserDir "dist/$folder"
if (Test-Path $portable) { Remove-Item $portable -Recurse -Force }
Move-Item $payload $portable
$archive = Join-Path $browserDir "dist/$folder.zip"
if (Test-Path $archive) { Remove-Item $archive -Force }
Compress-Archive -Path $portable -DestinationPath $archive -CompressionLevel Optimal
Write-Host "Created $archive"
