# Set working directory
cd "C:\Users\mlm36\documents\michaels-journal"

# Find the newest .md file
$post = Get-ChildItem -Path ".\content" -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 1

# Extract title from front matter or H1
$title = Select-String -Path $post.FullName -Pattern '^\# (.+)' | Select-Object -First 1 | ForEach-Object { $_.Matches[0].Groups[1].Value }

# Fallback: if no H1, use filename
if (-not $title) {
    $title = $post.BaseName
}

# Build the site
zola build

# Git operations
git add -A
git commit -m "$title"
git push
