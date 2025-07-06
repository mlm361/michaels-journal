@echo off
cd /d "C:\Users\mlm36\documents\michaels-journal"

echo 🔨 Building Zola site...
zola build

if %errorlevel% neq 0 (
    echo ❌ Zola build failed. Aborting.
    pause
    exit /b %errorlevel%
)

echo 🧠 Staging all changes for Git...
git add -A

echo 💬 Enter commit message:
set /p msg="> "
git commit -m "%msg%"

echo 🚀 Pushing to GitHub...
git push

echo ✅ Done! Your site is being deployed by Cloudflare Pages.
pause

