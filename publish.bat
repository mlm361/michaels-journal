@echo off
cd /d "%~dp0"

echo 🔧 Building site with Zola...
zola build
IF %ERRORLEVEL% NEQ 0 (
    echo ❌ Zola build failed.
    pause
    exit /b %ERRORLEVEL%
)

echo 📝 Staging all changes...
git add .

echo 💬 Enter commit message:
set /p commitMessage=

git commit -m "%commitMessage%"
git push

echo ✅ Site updated and pushed to GitHub!
pause
