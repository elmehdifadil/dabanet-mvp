# ============================================================
#  DabaNet MVP — Script de déploiement complet
#  Lance ce script APRES avoir :
#   1. Rempli .env avec ta vraie ANTHROPIC_API_KEY
#   2. Créé un repo GitHub vide nommé "dabanet-mvp"
# ============================================================

$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")

Write-Host "`n=== DabaNet MVP Deploy ===" -ForegroundColor Cyan

# Lire la clé API depuis .env
$envContent = Get-Content ".env" -Raw
if ($envContent -match 'ANTHROPIC_API_KEY=(.+)') {
    $apiKey = $Matches[1].Trim()
} else {
    Write-Host "ERREUR: ANTHROPIC_API_KEY introuvable dans .env" -ForegroundColor Red
    exit 1
}

if ($apiKey -like "*REMPLACE*" -or $apiKey.Length -lt 20) {
    Write-Host "ERREUR: Remplace la clé dans .env par ta vraie clé Anthropic (sk-ant-...)" -ForegroundColor Red
    exit 1
}

Write-Host "Clé API detectee" -ForegroundColor Green

# Demander l'URL du repo GitHub
$repoUrl = Read-Host "`nColle l'URL de ton repo GitHub (ex: https://github.com/TON_NOM/dabanet-mvp.git)"

# Push sur GitHub
Write-Host "`nPush vers GitHub..." -ForegroundColor Yellow
git remote remove origin 2>$null
git remote add origin $repoUrl
git push -u origin master

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERREUR lors du push GitHub. Verifie l'URL et tes credentials." -ForegroundColor Red
    exit 1
}
Write-Host "GitHub OK" -ForegroundColor Green

# Déployer sur Vercel
Write-Host "`nDéploiement sur Vercel..." -ForegroundColor Yellow
Write-Host "(Tu devras te connecter à Vercel si c'est la premiere fois)`n"

vercel --yes `
  -e "ANTHROPIC_API_KEY=$apiKey" `
  --prod

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nMVP deploye avec succes !" -ForegroundColor Green
} else {
    Write-Host "`nErreur Vercel. Essaie: vercel login puis relance ce script." -ForegroundColor Red
}
