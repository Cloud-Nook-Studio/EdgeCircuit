[CmdletBinding()]
param(
    [switch]$SkipBrowser
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$appUrl = "http://127.0.0.1:5173"

function Test-AppReady {
    try {
        $response = Invoke-WebRequest `
            -UseBasicParsing `
            -Uri $appUrl `
            -TimeoutSec 2

        return (
            $response.StatusCode -eq 200 -and
            $response.Content -match '<div id="root">'
        )
    }
    catch {
        return $false
    }
}

try {
    if (Test-AppReady) {
        Write-Host "The brain training app is already running."
    }
    else {
        $npmCommand = Get-Command "npm.cmd" -ErrorAction Stop

        if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "node_modules"))) {
            throw "Dependencies are not installed. Open a terminal here and run: npm install"
        }

        Write-Host "Starting the brain training app..."

        $serverArguments = @(
            "run"
            "dev"
            "--workspace"
            "@brain-training/web"
            "--"
            "--host"
            "127.0.0.1"
            "--port"
            "5173"
            "--strictPort"
        )

        Start-Process `
            -FilePath $npmCommand.Source `
            -ArgumentList $serverArguments `
            -WorkingDirectory $repoRoot `
            -WindowStyle Hidden

        $ready = $false

        for ($attempt = 0; $attempt -lt 80; $attempt += 1) {
            if (Test-AppReady) {
                $ready = $true
                break
            }

            Start-Sleep -Milliseconds 250
        }

        if (-not $ready) {
            throw "The app did not start on port 5173. Run 'npm run dev:web' in a terminal to see the server error."
        }
    }

    if (-not $SkipBrowser) {
        Write-Host "Opening $appUrl"
        Start-Process $appUrl
    }
}
catch {
    Write-Host ""
    Write-Host "Could not open the app:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}
