# Holocron install script — Windows (PowerShell)
# Symlinks Holocron config into the active agent harness directories.
# Uses directory junctions (no admin required) on Windows.

$ErrorActionPreference = "Stop"

$HolocronDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Holocron install"
Write-Host "Source: $HolocronDir"
Write-Host ""

# ── Harness targets ──────────────────────────────────────────────────────────
# Add new harnesses here as they become supported.

$Harnesses = @{
  "opencode" = "$env:USERPROFILE\.opencode"
  # "claude-code" = "$env:USERPROFILE\.claude"   # future
}

# ── Helper ───────────────────────────────────────────────────────────────────

function Link-Dir {
  param($Src, $Dest, $Label)

  if (Test-Path $Dest) {
    $item = Get-Item $Dest
    if ($item.LinkType) {
      Write-Host "  ⚠  $Label already linked — skipping"
    } else {
      Write-Host "  ⚠  $Label exists as a real directory — skipping (remove manually to replace)"
    }
  } else {
    # Use junction (no admin required); works for directories on all Windows versions
    New-Item -ItemType Junction -Path $Dest -Target $Src | Out-Null
    Write-Host "  ✓  $Label → $Dest"
  }
}

# ── Memory dir ───────────────────────────────────────────────────────────────

Write-Host "Memory directory"
if (-not $env:HOLOCRON_MEMORY_DIR) {
  Write-Host "  ℹ  HOLOCRON_MEMORY_DIR is not set."
  Write-Host "     Set it in your PowerShell profile to point to your private memory repo:"
  Write-Host "     `$env:HOLOCRON_MEMORY_DIR = 'C:\path\to\your\private\memory'"
} else {
  Write-Host "  ✓  HOLOCRON_MEMORY_DIR=$env:HOLOCRON_MEMORY_DIR"
}
Write-Host ""

# ── Symlink each harness ─────────────────────────────────────────────────────

$Dirs = @("skills", "commands", "plugins", "instructions")

foreach ($harness in $Harnesses.Keys) {
  $Target = $Harnesses[$harness]
  Write-Host "Harness: $harness ($Target)"
  New-Item -ItemType Directory -Force -Path $Target | Out-Null
  foreach ($dir in $Dirs) {
    Link-Dir "$HolocronDir\$dir" "$Target\$dir" $dir
  }
  Write-Host ""
}

Write-Host "Done. Restart your agent harness to pick up the new config."
