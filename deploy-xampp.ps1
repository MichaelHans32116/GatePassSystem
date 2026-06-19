param([switch]$NoBrowser, [switch]$SkipBuild)

$arguments = @{
    UseXamppApache = $true
    NoBrowser = $NoBrowser
    SkipBuild = $SkipBuild
}

& (Join-Path $PSScriptRoot 'start-local.ps1') @arguments
