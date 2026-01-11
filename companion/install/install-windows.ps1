# Windows Installation Script for Download Router Companion
# Installs native messaging host manifest for Chrome via Registry

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CompanionDir = Split-Path -Parent $ScriptDir
$ManifestSource = Join-Path $CompanionDir "manifests\com.downloadrouter.host.json"

# Determine executable path (from built app or development)
$ExecutablePath = $null
if (Test-Path "$CompanionDir\dist\win-unpacked\Download Router Companion.exe") {
    $ExecutablePath = "$CompanionDir\dist\win-unpacked\Download Router Companion.exe"
} elseif (Test-Path "$CompanionDir\node_modules\.bin\electron.cmd") {
    # Development mode - use node to run main.js
    $ExecutablePath = "node"
    $NodeArgs = "$CompanionDir\main.js"
} else {
    Write-Host "Error: Could not find companion executable" -ForegroundColor Red
    exit 1
}

# Native messaging hosts registry path
$RegistryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.downloadrouter.host"

# Read manifest template
if (-not (Test-Path $ManifestSource)) {
    Write-Host "Error: Manifest template not found at $ManifestSource" -ForegroundColor Red
    exit 1
}

$ManifestContent = Get-Content $ManifestSource -Raw

# Replace placeholders
$ManifestContent = $ManifestContent -replace "COMPANION_EXECUTABLE_PATH", ($ExecutablePath -replace '\\', '\\')
$ExtensionId = if (Test-Path "$CompanionDir\.extension-id") { Get-Content "$CompanionDir\.extension-id" } else { "YOUR_EXTENSION_ID" }
$ManifestContent = $ManifestContent -replace "YOUR_EXTENSION_ID", $ExtensionId

# Parse JSON
$Manifest = $ManifestContent | ConvertFrom-Json

# Create registry key
if (-not (Test-Path $RegistryPath)) {
    New-Item -Path $RegistryPath -Force | Out-Null
}

# Write manifest to registry
Set-ItemProperty -Path $RegistryPath -Name "(default)" -Value ($Manifest | ConvertTo-Json -Compress) -Type String

Write-Host "Native messaging host manifest installed successfully!" -ForegroundColor Green
Write-Host "Registry location: $RegistryPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Update the extension ID in the manifest if needed"
Write-Host "2. Restart Chrome"
Write-Host "3. Open the extension options to verify companion app connection"
