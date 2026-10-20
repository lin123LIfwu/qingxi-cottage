# Rebuild the timber house from scratch:
#   Blender (model + textures + AO + GLB + houseLayout.js) -> house_pack -> emit_house.
# usage: powershell -NoProfile -ExecutionPolicy Bypass -File models/source/build_house.ps1 [-Preview]
param([switch]$Preview)
$ErrorActionPreference = 'Stop'
$blender = 'D:\blander\blender.exe'
$here = $PSScriptRoot
$root = Split-Path -Parent (Split-Path -Parent $here)
if (-not (Test-Path $blender)) { throw "Blender not found: $blender" }

$extra = @()
if ($Preview) { $extra += '--preview' }
& $blender -b --factory-startup -noaudio --python-exit-code 1 -P "$here\house\house.py" -- @extra
if ($LASTEXITCODE -ne 0) { throw "Blender failed with exit code $LASTEXITCODE" }

Push-Location "$root\models\game_export"
try {
  node house_pack.mjs
  if ($LASTEXITCODE -ne 0) { throw "house_pack failed with exit code $LASTEXITCODE" }
  node emit_house.mjs ..\source\out\house_packed.glb
  if ($LASTEXITCODE -ne 0) { throw "emit_house failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}
Write-Host 'house build complete: models/source/out/house.blend + house.glb, src/assets/house*.js, src/assets/houseLayout.js'
