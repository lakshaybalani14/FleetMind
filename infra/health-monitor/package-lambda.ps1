$ErrorActionPreference = "Stop"
$infraRoot = Split-Path -Parent $PSScriptRoot
$assemblyPath = Join-Path $infraRoot "cdk.out\FleetMindBackend.template.json"
if (-not (Test-Path -LiteralPath $assemblyPath)) {
  throw "Run 'npm run synth' from the infra folder first."
}

$template = Get-Content -LiteralPath $assemblyPath -Raw | ConvertFrom-Json -AsHashtable
$function = $template.Resources.GetEnumerator() |
  Where-Object { $_.Value.Type -eq "AWS::Lambda::Function" -and $_.Value.Properties.Handler -eq "index.handler" } |
  Select-Object -First 1
if (-not $function) { throw "Could not find the bundled telemetry Lambda in the CDK output." }

$assetHash = $function.Value.Properties.Code.S3Key -replace "\.zip$", ""
$bundlePath = Join-Path $infraRoot "cdk.out\asset.$assetHash\index.js"
if (-not (Test-Path -LiteralPath $bundlePath)) { throw "Bundled Lambda source was not found: $bundlePath" }

$zipPath = Join-Path $PSScriptRoot "fleetmind-telemetry-api.zip"
Compress-Archive -LiteralPath $bundlePath -DestinationPath $zipPath -Force
Write-Output "Created $zipPath"
