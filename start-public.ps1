param(
    [switch]$NoBrowser,
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$publicState = Join-Path $repo 'LocalData\public-access'
$publicRoot = 'C:\xampp\htdocs\GatePassPublic'
$apache = 'C:\xampp\apache\bin\httpd.exe'
$httpdConf = 'C:\xampp\apache\conf\httpd.conf'
$publicConf = 'C:\xampp\apache\conf\extra\gatepass-public.conf'
$htpasswd = 'C:\xampp\apache\bin\htpasswd.exe'
$htpasswdFile = Join-Path $publicState 'public.htpasswd'
$credentialsFile = Join-Path $publicState 'credentials.txt'
$urlFile = Join-Path $publicState 'public-url.txt'
$pidFile = Join-Path $publicState 'cloudflared.pid'
$apacheBackup = Join-Path $publicState 'httpd.conf.before-public'
$stdoutLog = Join-Path $publicState 'cloudflared.out.log'
$stderrLog = Join-Path $publicState 'cloudflared.err.log'

function Get-CloudflaredPath {
    $command = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $candidates = @(
        "$env:ProgramFiles\cloudflared\cloudflared.exe",
        "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe"
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    $wingetPackageRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
    if (Test-Path $wingetPackageRoot) {
        $packageBinary = Get-ChildItem $wingetPackageRoot `
            -Recurse `
            -Filter cloudflared.exe `
            -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($packageBinary) {
            return $packageBinary.FullName
        }
    }

    return $null
}

function Test-PublicGateway(
    [string]$Url,
    [string]$Authorization,
    [int]$TimeoutSeconds = 5
) {
    if ($Url -notmatch '^https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com/?$') {
        return $false
    }

    function Test-WithCurlArguments([string[]]$ResolveArguments) {
        $curlCommon = @(
            '--silent',
            '--output', 'NUL',
            '--connect-timeout', $TimeoutSeconds,
            '--max-time', $TimeoutSeconds,
            '--write-out', '%{http_code}'
        ) + $ResolveArguments
        $unauthenticatedStatus =
            & curl.exe @curlCommon $Url 2>$null
        $authenticatedStatus =
            & curl.exe @curlCommon `
                --header "Authorization: $Authorization" `
                $Url 2>$null
        $unauthenticatedHealthStatus =
            & curl.exe @curlCommon "$Url/api/health" 2>$null
        $authenticatedHealthStatus =
            & curl.exe @curlCommon `
                --header "Authorization: $Authorization" `
                "$Url/api/health" 2>$null

        return [int]$unauthenticatedStatus -eq 401 -and
            [int]$authenticatedStatus -eq 200 -and
            [int]$unauthenticatedHealthStatus -eq 401 -and
            [int]$authenticatedHealthStatus -eq 200
    }

    try {
        if (Test-WithCurlArguments @()) {
            return $true
        }

        $hostName = ([Uri]$Url).Host
        $dnsResult = Invoke-RestMethod `
            -Headers @{ Accept = 'application/dns-json' } `
            -Uri "https://cloudflare-dns.com/dns-query?name=$hostName&type=A" `
            -TimeoutSec $TimeoutSeconds
        $addresses = @(
            $dnsResult.Answer |
            Where-Object type -eq 1 |
            ForEach-Object data
        )
        foreach ($address in $addresses) {
            if (Test-WithCurlArguments @(
                '--resolve',
                "${hostName}:443:${address}"
            )) {
                return $true
            }
        }

        return $false
    } catch {
        return $false
    }
}

function Get-PublishedTunnelUrl {
    $logText = @(
        Get-Content $stdoutLog -Raw -ErrorAction SilentlyContinue
        Get-Content $stderrLog -Raw -ErrorAction SilentlyContinue
    ) -join [Environment]::NewLine
    $match = [regex]::Match(
        $logText,
        'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($match.Success) {
        return $match.Value
    }

    return $null
}

if (-not (Test-Path $apache) -or
    -not (Test-Path $httpdConf) -or
    -not (Test-Path $htpasswd)) {
    throw 'XAMPP Apache tools were not found under C:\xampp.'
}

New-Item -ItemType Directory -Force -Path $publicState | Out-Null

& (Join-Path $repo 'start-local.ps1') `
    -NoBrowser `
    -SkipBuild `
    -UseXamppApache

$cloudflared = Get-CloudflaredPath
if (-not $cloudflared -and -not $SkipInstall) {
    & winget install `
        --id Cloudflare.cloudflared `
        --exact `
        --silent `
        --accept-package-agreements `
        --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw 'Cloudflare Tunnel installation failed.'
    }
    $cloudflared = Get-CloudflaredPath
}
if (-not $cloudflared) {
    throw 'cloudflared is not installed. Run again without -SkipInstall.'
}

New-Item -ItemType Directory -Force -Path $publicRoot | Out-Null
New-Item -ItemType Directory -Force `
    -Path (Join-Path $publicRoot 'Frontend') | Out-Null
Copy-Item (Join-Path $repo 'index.html') $publicRoot -Force
Copy-Item (Join-Path $repo 'Frontend\*') `
    (Join-Path $publicRoot 'Frontend') `
    -Recurse `
    -Force

$username = 'gatepass-practice'
$password = $null
if (Test-Path $credentialsFile) {
    try {
        $savedCredentials =
            Get-Content $credentialsFile -ErrorAction Stop |
            ConvertFrom-StringData
        if ($savedCredentials.USERNAME -eq $username -and
            -not [string]::IsNullOrWhiteSpace($savedCredentials.PASSWORD)) {
            $password = $savedCredentials.PASSWORD
        }
    } catch {
        $password = $null
    }
}

if (-not $password) {
    $passwordAlphabet =
        'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@_-'
    $passwordBytes = New-Object byte[] 24
    $passwordGenerator =
        [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $passwordGenerator.GetBytes($passwordBytes)
    } finally {
        $passwordGenerator.Dispose()
    }
    $password = -join ($passwordBytes | ForEach-Object {
        $passwordAlphabet[$_ % $passwordAlphabet.Length]
    })
}

& $htpasswd -b -c $htpasswdFile $username $password | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to create the public access password file.'
}

$publicRootApache = $publicRoot.Replace('\', '/')
$htpasswdApache = $htpasswdFile.Replace('\', '/')
$publicConfiguration = @"
Listen 127.0.0.1:8090

<VirtualHost 127.0.0.1:8090>
    ServerName gatepass-practice.local
    DocumentRoot "$publicRootApache"
    ProxyPreserveHost On
    ProxyPass "/api/" "http://127.0.0.1:5087/api/"
    ProxyPassReverse "/api/" "http://127.0.0.1:5087/api/"

    <Directory "$publicRootApache">
        Options -Indexes +FollowSymLinks
        AllowOverride None
    </Directory>

    <Location "/">
        AuthType Basic
        AuthName "Gate Pass Practice Server"
        AuthUserFile "$htpasswdApache"
        Require valid-user
    </Location>

    RequestHeader set Authorization "expr=%{req:X-Api-Authorization}" "expr=-n %{req:X-Api-Authorization}"
    RequestHeader unset X-Api-Authorization
</VirtualHost>
"@
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText(
    $publicConf,
    $publicConfiguration,
    $utf8NoBom)

$httpdContent = Get-Content -LiteralPath $httpdConf -Raw
if (-not (Test-Path $apacheBackup)) {
    Copy-Item -LiteralPath $httpdConf -Destination $apacheBackup
}
$httpdContent = $httpdContent.Replace(
    '#LoadModule proxy_http_module modules/mod_proxy_http.so',
    'LoadModule proxy_http_module modules/mod_proxy_http.so')
$httpdContent = $httpdContent.Replace(
    '#LoadModule headers_module modules/mod_headers.so',
    'LoadModule headers_module modules/mod_headers.so')
$includeLine = 'Include conf/extra/gatepass-public.conf'
if ($httpdContent -notmatch [regex]::Escape($includeLine)) {
    $httpdContent = $httpdContent.TrimEnd() +
        [Environment]::NewLine +
        $includeLine +
        [Environment]::NewLine
}
[System.IO.File]::WriteAllText(
    $httpdConf,
    $httpdContent,
    $utf8NoBom)

& $apache -t
if ($LASTEXITCODE -ne 0) {
    throw 'Apache configuration validation failed.'
}

$apacheProcesses = Get-Process httpd -ErrorAction SilentlyContinue
if ($apacheProcesses) {
    $apacheProcesses | Stop-Process -Force
    Start-Sleep -Milliseconds 750
}
Start-Process `
    -FilePath $apache `
    -WorkingDirectory 'C:\xampp\apache' `
    -WindowStyle Hidden

for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
        $probe = Invoke-WebRequest `
            -UseBasicParsing `
            -Uri 'http://127.0.0.1:8090/api/health' `
            -Headers @{
                Authorization = 'Basic ' + [Convert]::ToBase64String(
                    [Text.Encoding]::ASCII.GetBytes("${username}:${password}"))
            } `
            -TimeoutSec 2
        if ($probe.StatusCode -eq 200) {
            break
        }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}
if (-not $probe -or $probe.StatusCode -ne 200) {
    throw 'The protected Apache public gateway did not become healthy.'
}

$publicAuthorization =
    'Basic ' + [Convert]::ToBase64String(
        [Text.Encoding]::ASCII.GetBytes("${username}:${password}"))

$existingTunnel = $null
$existingPublicUrl = $null
if (Test-Path $pidFile) {
    $oldPid = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($oldPid) {
        $existingTunnel =
            Get-Process -Id $oldPid -ErrorAction SilentlyContinue
    }
}
if ($existingTunnel) {
    $existingPublicUrl = Get-PublishedTunnelUrl
    if (-not $existingPublicUrl -and (Test-Path $urlFile)) {
        $existingPublicUrl =
            (Get-Content $urlFile -ErrorAction SilentlyContinue |
                Select-Object -First 1).Trim()
    }
    if (Test-PublicGateway $existingPublicUrl $publicAuthorization 5) {
        Set-Content -LiteralPath $credentialsFile -Encoding UTF8 -Value @(
            "URL=$existingPublicUrl",
            "USERNAME=$username",
            "PASSWORD=$password",
            'NOTE=Temporary HTTPS practice access. Stop it when testing is complete.'
        )
        Set-Content `
            -LiteralPath $urlFile `
            -Value $existingPublicUrl `
            -Encoding ASCII
        Write-Host 'Existing protected public tunnel is still healthy.' `
            -ForegroundColor Green
        Write-Host "Public URL: $existingPublicUrl"
        Write-Host "Username: $username"
        Write-Host "Credentials file: $credentialsFile"
        Write-Host "Stop command: .\stop-public.ps1"
        if (-not $NoBrowser) {
            Start-Process $existingPublicUrl
        }
        exit 0
    }
}

if ($existingTunnel) {
    Stop-Process -Id $existingTunnel.Id -Force
}
Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
Remove-Item $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue

$tunnel = Start-Process `
    -FilePath $cloudflared `
    -ArgumentList @(
        'tunnel',
        '--url',
        'http://127.0.0.1:8090',
        '--protocol',
        'http2',
        '--no-autoupdate'
    ) `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -WindowStyle Hidden `
    -PassThru
Set-Content -LiteralPath $pidFile -Value $tunnel.Id -Encoding ASCII

$publicUrl = $null
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Milliseconds 500
    $publishedUrl = Get-PublishedTunnelUrl
    if ($publishedUrl) {
        $publicUrl = $publishedUrl
        break
    }
    if ($tunnel.HasExited) {
        throw "Cloudflare Tunnel stopped before publishing a URL. See $stderrLog"
    }
}
if (-not $publicUrl) {
    throw "Cloudflare Tunnel did not provide a public URL. See $stderrLog"
}

$publicReady = $false
for ($attempt = 0; $attempt -lt 180; $attempt++) {
    if (Test-PublicGateway $publicUrl $publicAuthorization 5) {
        $publicReady = $true
        break
    }
    if ($tunnel.HasExited) {
        throw "Cloudflare Tunnel stopped during public verification. See $stderrLog"
    }
    Start-Sleep -Seconds 1
}
if (-not $publicReady) {
    throw "The tunnel is running, but public DNS did not become ready within three minutes. Keep the process running and retry .\start-public.ps1; it will reuse the same tunnel when available."
}

Set-Content -LiteralPath $credentialsFile -Encoding UTF8 -Value @(
    "URL=$publicUrl",
    "USERNAME=$username",
    "PASSWORD=$password",
    'NOTE=Temporary HTTPS practice access. Stop it when testing is complete.'
)
Set-Content -LiteralPath $urlFile -Value $publicUrl -Encoding ASCII

Write-Host 'Protected public practice server is ready.' -ForegroundColor Green
Write-Host "Public URL: $publicUrl"
Write-Host "Username: $username"
Write-Host "Credentials file: $credentialsFile"
Write-Host "Stop command: .\stop-public.ps1"

if (-not $NoBrowser) {
    Start-Process $publicUrl
}
