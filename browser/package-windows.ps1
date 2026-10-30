$ErrorActionPreference = 'Stop'
$browserDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$payload = Join-Path $browserDir 'dist/payload'
$manifest = Get-Content (Join-Path $browserDir 'package.json') -Raw | ConvertFrom-Json
$source = Get-Content (Join-Path $browserDir 'windows-launcher.cs') -Raw
$output = Join-Path $payload 'JUAI.exe'
$icon = (Resolve-Path (Join-Path $payload 'JUAI.ico')).Path
Add-Type -TypeDefinition $source -OutputAssembly $output -OutputType WindowsApplication -ReferencedAssemblies @('System.dll', 'System.Windows.Forms.dll') -CompilerOptions "/win32icon:$icon"
$folder = "JUAI-$($manifest.version)-windows-x64"
$portable = Join-Path $browserDir "dist/$folder"
if (Test-Path $portable) { Remove-Item $portable -Recurse -Force }
Move-Item $payload $portable
$archive = Join-Path $browserDir "dist/$folder.zip"
if (Test-Path $archive) { Remove-Item $archive -Force }
Compress-Archive -Path $portable -DestinationPath $archive -CompressionLevel Optimal
Write-Host "Created $archive"
