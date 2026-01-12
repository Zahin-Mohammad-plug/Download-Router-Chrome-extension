# Windows Installation Script for Download Router Companion
# Platform: Windows ONLY
# Purpose: Installs native messaging host manifest for Chrome on Windows
# 
# This script is Windows-specific and uses Windows Registry:
# - Registry location: HKCU:\Software\Google\Chrome\NativeMessagingHosts\
# - Requires PowerShell (standard on Windows 10+)
# - Handles Windows executable paths and registry operations

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CompanionDir = Split-Path -Parent $ScriptDir
$ManifestSource = Join-Path $CompanionDir "manifests\com.downloadrouter.host.json"

# Determine executable path (from installed app, built app, or development)
$ExecutablePath = $null

# Check if running from installed app (common installation locations)
$InstalledLocations = @(
    "$env:LOCALAPPDATA\Programs\download-router-companion\Download Router Companion.exe",
    "$env:ProgramFiles\Download Router Companion\Download Router Companion.exe",
    "$env:ProgramFiles(x86)\Download Router Companion\Download Router Companion.exe"
)

foreach ($location in $InstalledLocations) {
    if (Test-Path $location) {
        $ExecutablePath = $location
        break
    }
}

# Check if running from build directory
if (-not $ExecutablePath) {
    if (Test-Path "$CompanionDir\dist\win-unpacked\Download Router Companion.exe") {
        $ExecutablePath = "$CompanionDir\dist\win-unpacked\Download Router Companion.exe"
    } elseif (Test-Path "$CompanionDir\dist\win\Download Router Companion.exe") {
        $ExecutablePath = "$CompanionDir\dist\win\Download Router Companion.exe"
    }
}

# Development mode
if (-not $ExecutablePath) {
    if (Test-Path "$CompanionDir\node_modules\.bin\electron.cmd") {
        $ExecutablePath = "node"
        $NodeArgs = "$CompanionDir\main.js"
    } else {
        Write-Host "Error: Could not find companion executable" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please ensure the companion app is installed:" -ForegroundColor Yellow
        Write-Host "  1. Download the installer from GitHub releases" -ForegroundColor Gray
        Write-Host "  2. Run the installer to install the app" -ForegroundColor Gray
        Write-Host "  3. Run this installer script again" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Or for development: cd companion && npm install" -ForegroundColor Gray
        exit 1
    }
}

# Native messaging hosts registry path
$RegistryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.downloadrouter.host"

# Read manifest template
if (-not (Test-Path $ManifestSource)) {
    Write-Host "Error: Manifest template not found at $ManifestSource" -ForegroundColor Red
    exit 1
}

$ManifestContent = Get-Content $ManifestSource -Raw

# Get extension ID (from file or prompt user)
$ExtensionId = ""
if (Test-Path "$CompanionDir\.extension-id") {
    $ExtensionId = (Get-Content "$CompanionDir\.extension-id" -Raw).Trim()
}

# If no extension ID found, prompt user
if ([string]::IsNullOrWhiteSpace($ExtensionId) -or $ExtensionId -eq "YOUR_EXTENSION_ID") {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "Extension ID Required" -ForegroundColor Yellow
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To connect the companion app to your Chrome extension, we need your extension ID." -ForegroundColor White
    Write-Host ""
    Write-Host "How to find your Extension ID:" -ForegroundColor White
    Write-Host "1. Open Chrome and go to: chrome://extensions/" -ForegroundColor Gray
    Write-Host "2. Enable 'Developer mode' (toggle in top-right)" -ForegroundColor Gray
    Write-Host "3. Find 'Download Router' extension" -ForegroundColor Gray
    Write-Host "4. Copy the Extension ID (32-character string below the extension name)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Note: If installing from Chrome Web Store, all users have the same extension ID." -ForegroundColor Gray
    Write-Host "      You can find it in the extension's Web Store page or chrome://extensions/" -ForegroundColor Gray
    Write-Host ""
    
    $UserExtId = Read-Host "Enter your Extension ID (or press Enter to skip and edit manually later)"
    
    if (-not [string]::IsNullOrWhiteSpace($UserExtId)) {
        $ExtensionId = $UserExtId.Trim().Substring(0, [Math]::Min(32, $UserExtId.Trim().Length))
        # Save for future use
        $ExtensionId | Out-File -FilePath "$CompanionDir\.extension-id" -Encoding utf8 -NoNewline
        Write-Host ""
        Write-Host "✓ Extension ID saved to .extension-id" -ForegroundColor Green
    } else {
        $ExtensionId = "YOUR_EXTENSION_ID"
        Write-Host ""
        Write-Host "⚠️  No extension ID provided. You'll need to edit the registry manually." -ForegroundColor Yellow
        Write-Host "   Registry path: $RegistryPath" -ForegroundColor Gray
    }
    Write-Host ""
}

# Replace placeholders
$ManifestContent = $ManifestContent -replace "COMPANION_EXECUTABLE_PATH", ($ExecutablePath -replace '\\', '\\')
$ManifestContent = $ManifestContent -replace "YOUR_EXTENSION_ID", $ExtensionId

# Parse JSON
$Manifest = $ManifestContent | ConvertFrom-Json

# Create registry key
if (-not (Test-Path $RegistryPath)) {
    New-Item -Path $RegistryPath -Force | Out-Null
}

# Write manifest to registry
Set-ItemProperty -Path $RegistryPath -Name "(default)" -Value ($Manifest | ConvertTo-Json -Compress) -Type String

Write-Host "✅ Native messaging host manifest installed successfully!" -ForegroundColor Green
Write-Host "   Registry location: $RegistryPath" -ForegroundColor Cyan
Write-Host ""

if ($ExtensionId -ne "YOUR_EXTENSION_ID") {
    Write-Host "✓ Extension ID configured: $ExtensionId" -ForegroundColor Green
} else {
    Write-Host "⚠️  Extension ID not configured. Please edit the registry:" -ForegroundColor Yellow
    Write-Host "   $RegistryPath" -ForegroundColor Gray
    Write-Host "   Replace 'YOUR_EXTENSION_ID' with your actual extension ID" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "1. Restart Chrome completely (quit and relaunch)" -ForegroundColor Gray
Write-Host "2. Open extension options → Settings tab" -ForegroundColor Gray
Write-Host "3. Verify companion app status shows 'Installed'" -ForegroundColor Gray
