var THEME_KEY = 'ergo-theme';

function applyTheme(theme) {
  var link = document.getElementById('themeCSS');
  if (link) link.href = '/' + theme + '.css';
  localStorage.setItem(THEME_KEY, theme);

  var root = document.documentElement;
  if (root) {
    root.dataset.theme = theme;
    root.classList.toggle('theme-dark', theme === 'dark');
    root.classList.toggle('theme-default', theme !== 'dark');
  }

  var isDark = theme === 'dark';
  var icon  = document.getElementById('theme-icon');
  var label = document.getElementById('theme-label');
  if (icon)  icon.textContent  = isDark ? '☀️' : '🌙';
  if (label) label.textContent = isDark ? 'Light' : 'Dark';
}

function toggleTheme() {
  var current = localStorage.getItem(THEME_KEY) || 'default';
  applyTheme(current === 'dark' ? 'default' : 'dark');
}

function main() {
  var stored = localStorage.getItem(THEME_KEY) || 'default';
  applyTheme(stored);
}
