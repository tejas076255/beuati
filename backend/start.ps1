# BeautyFolio Backend — PowerShell startup script
# Usage: cd backend; .\start.ps1
# Or with reload:    .\start.ps1 --reload

$ErrorActionPreference = "Stop"

$venvPython = ".\.venv\Scripts\python.exe"
$venvUvicorn = ".\.venv\Scripts\uvicorn.exe"

# Check venv exists
if (-not (Test-Path $venvPython)) {
    Write-Host "Virtual environment not found. Creating..." -ForegroundColor Yellow
    python -m venv .venv
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    & ".\.venv\Scripts\pip.exe" install -r requirements.txt
}

# Check .env exists
if (-not (Test-Path ".env")) {
    Write-Host "WARNING: .env not found. Copy .env.example to .env and fill in secrets." -ForegroundColor Red
    exit 1
}

# Check critical env vars
$envContent = Get-Content ".env" -Raw
if ($envContent -match "SUPABASE_SERVICE_ROLE_KEY=$" -or $envContent -notmatch "SUPABASE_SERVICE_ROLE_KEY=.+") {
    Write-Host ""
    Write-Host "WARNING: SUPABASE_SERVICE_ROLE_KEY is not set in .env" -ForegroundColor Yellow
    Write-Host "  Admin and billing operations will be unavailable." -ForegroundColor Yellow
    Write-Host "  Get it from: Supabase Dashboard > Project Settings > API > service_role" -ForegroundColor Yellow
    Write-Host ""
}
if ($envContent -match "SUPABASE_JWT_SECRET=$" -or $envContent -notmatch "SUPABASE_JWT_SECRET=.+") {
    Write-Host "WARNING: SUPABASE_JWT_SECRET is not set in .env" -ForegroundColor Yellow
    Write-Host "  Auth on protected routes will return 500." -ForegroundColor Yellow
    Write-Host "  Get it from: Supabase Dashboard > Project Settings > API > JWT Secret" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Starting BeautyFolio Backend..." -ForegroundColor Green
Write-Host "  API docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "  Health:   http://localhost:8000/api/health" -ForegroundColor Cyan
Write-Host ""

# Pass any extra args (e.g. --reload) to uvicorn
& $venvUvicorn app.main:app --host 0.0.0.0 --port 8000 @args
