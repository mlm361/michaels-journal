// Build the real templates in a temporary copy; never edit source content.
// Run: ZOLA_BIN=/path/to/zola node scripts/check-notes-retention.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-notes-'));
const cases = [
  ['active', 'enabled = true\nactive = true', true, true],
  ['expired', 'enabled = true\nactive = false', true, false],
  ['disabled', 'enabled = false\nactive = true', true, false],
  ['ordinary', null, true, false],
  ['missing-active', 'enabled = true', true, false],
  ['not-a-note', null, false, false],
];

try {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const relative of files) {
    const destination = path.join(fixture, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
  }
  for (const [name, sticky, isNote] of cases) {
    const metadata = sticky === null ? '' : `\n[extra.sticky_note]\n${sticky}\n`;
    fs.writeFileSync(path.join(fixture, 'content', 'notes', `review-${name}.md`),
      `+++\ntitle = "Review ${name}"\nslug = "review-${name}"\ndate = "2026-09-01T12:00:00-04:00"\n[extra]\npost_type = "${isNote ? 'note' : 'post'}"\n${metadata}+++\n\nREVIEW_MARKER_${name}\n`);
  }
  execFileSync(process.env.ZOLA_BIN || 'zola', ['--root', fixture, 'build'], { encoding: 'utf8', stdio: 'pipe' });
  const html = fs.readFileSync(path.join(fixture, 'public', 'notes', 'index.html'), 'utf8');
  const archive = fs.readFileSync(path.join(fixture, 'public', 'archive', 'index.html'), 'utf8');
  const articles = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/g) || [];
  for (const [name, , isNote, pinned] of cases) {
    const matching = articles.filter(article => article.includes(`REVIEW_MARKER_${name}`));
    assert.equal(matching.length, isNote ? 1 : 0, `${name}: note must appear exactly once`);
    if (isNote) {
      assert.equal(/class="[^"]*\bsticky-note\b/.test(matching[0]), pinned, `${name}: pinned placement`);
      assert(archive.includes(`/notes/review-${name}/`), `${name}: archive retention`);
      assert(fs.existsSync(path.join(fixture, 'public', 'notes', `review-${name}`, 'index.html')), `${name}: permalink retention`);
    }
  }
  assert(!html.includes('No notes yet'), 'Notes exist; do not render the empty state');
  console.log('PASS: six note-state cases, unique placement, archive and permalink retention');
} finally {
  assert.equal(path.dirname(path.resolve(fixture)), path.resolve(os.tmpdir()));
  fs.rmSync(fixture, { recursive: true, force: true });
}
