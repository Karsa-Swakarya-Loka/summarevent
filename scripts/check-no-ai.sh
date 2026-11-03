#!/bin/sh
# Menolak atribusi AI di commit dan PR (AGENTS.md bagian 1).
# Dipakai oleh .githooks/commit-msg, .githooks/pre-push, dan workflow no-ai-attribution.
#
#   scripts/check-no-ai.sh --message-file FILE   cek satu pesan commit
#   scripts/check-no-ai.sh --text-file FILE      cek teks bebas, misalnya judul + deskripsi PR
#   scripts/check-no-ai.sh --revs REV...         cek author, committer, dan pesan setiap commit
#                                                (argumen diteruskan ke git rev-list)

set -eu
LC_ALL=C
export LC_ALL

# Semua pola huruf kecil; teks diubah ke huruf kecil sebelum dicocokkan.
# Ada agent baru yang lolos? Tambahkan polanya di sini lewat PR.

# Agent atau bot AI sebagai author, committer, atau nilai trailer "*-by:".
tokens='claude|anthropic|copilot|chatgpt|openai|codex|gpt-?[0-9][a-z0-9.]*|gemini|cursor|cursoragent|aider|windsurf|codeium|devin[- ]?ai|google-labs-jules|jules[[]bot[]]|openhands|opendevin|all-hands|coderabbit(ai)?|lovable(-dev)?|gpt-engineer|tabnine|codewhisperer|amazon[- ]q|qodo|cline|(roo|kilo)[- ]?code|augment[- ]?code|zencoder|opencode|ampcode|factory-droid|sweep-ai|codegen-sh|sourcery-ai|replit|kiro|junie|qwen|deepseek|grok|mistral|perplexity|trae[- ]?(ai|agent)|v0[[]bot[]]|warp[- ]agent'
domains='anthropic\.com|openai\.com|cursor\.com|cursor\.sh|aider\.chat|all-hands\.dev|devin\.ai|cognition\.ai|codeium\.com|windsurf\.com|ampcode\.com|warp\.dev|opencode\.ai|factory\.ai|augmentcode\.com|lovable\.dev|trae\.ai|kiro\.dev|jules\.google|v0\.dev|sweep\.dev|codegen\.com'
ai_identity="(^|[^a-z0-9])(${tokens})([^a-z0-9]|\$)|@(${domains})"

# Footer dan link sesi yang ditulis agent di pesan commit atau deskripsi PR.
tools='claude( code)?|anthropic|chatgpt|openai|codex|(github )?copilot|gemini|aider|devin|jules|windsurf|codeium|opencode|kiro|junie|qwen|deepseek|grok|cline|(roo|kilo) code|gpt-?[0-9][a-z0-9.]*|ai agent'
verbs='generated|created|written|authored|co-authored|made|produced|built|coded|drafted|assisted|powered|helped'
kata_kerja='dibuat|ditulis|dihasilkan|dibantu|digenerate|digenerasi'
ai_phrase="(${verbs})( entirely| partially| partly| fully| mostly)? (with|by|using|via|in|from) [[]?(the )?(${tools})([^a-z0-9]|\$)|(${kata_kerja}) (oleh|dengan|pakai|menggunakan|lewat|sama|via) [[]?(${tools})([^a-z0-9]|\$)|🤖 *(generated|dibuat)|claude\\.ai/code|claude\\.com/claude-code|anthropic\\.com/claude-code|chatgpt\\.com/codex|cursor\\.com/(agents|background-agent)|app\\.devin\\.ai|jules\\.google|ampcode\\.com/threads"

# Trailer yang selalu berarti AI, apa pun nilainya.
ai_trailer='^[[:space:]]*(claude-session|amp-thread(-id)?|ai-[a-z-]+|x-ai-[a-z-]+|(generated|assisted|made|written|created)-(by|with|using))[[:space:]]*:'

# Trailer orang ("Co-authored-by:", "Signed-off-by:", ...), dicek nilainya dengan ai_identity.
person_trailer='^[[:space:]]*[a-z][a-z-]*-by[[:space:]]*:'

usage() {
  cat >&2 <<'EOF'
Pemakaian:
  scripts/check-no-ai.sh --message-file FILE
  scripts/check-no-ai.sh --text-file FILE
  scripts/check-no-ai.sh --revs REV...
EOF
  exit 2
}

# Cetak baris teks dari stdin yang memuat atribusi AI, diawali label $1.
# Status 1 kalau ada temuan.
scan_text() {
  text=$(tr 'A-Z' 'a-z')
  hits=$(
    {
      printf '%s\n' "$text" | grep -E -e "$ai_phrase" -e "$ai_trailer" || true
      printf '%s\n' "$text" | grep -E "$person_trailer" | grep -E "$ai_identity" || true
    } | awk '!seen[$0]++'
  )
  [ -n "$hits" ] || return 0
  printf '%s\n' "$hits" | while IFS= read -r line; do
    printf '  %s: %s\n' "$1" "$line" >&2
  done
  return 1
}

scan_message() {
  # Abaikan komentar git dan diff dari `git commit -v` di bawah garis gunting.
  awk '/^# -+ >8 -+$/ { exit } !/^#/' "$1" | scan_text "pesan commit"
}

scan_text_file() {
  scan_text "teks" < "$1"
}

scan_revs() {
  commits=$(git rev-list "$@")
  status=0
  for sha in $commits; do
    short=$(git rev-parse --short "$sha")
    for role in author committer; do
      case $role in
        author) who=$(git log -1 --format='%an <%ae>' "$sha") ;;
        committer) who=$(git log -1 --format='%cn <%ce>' "$sha") ;;
      esac
      if printf '%s\n' "$who" | tr 'A-Z' 'a-z' | grep -Eq "$ai_identity"; then
        printf '  %s %s: %s\n' "$short" "$role" "$who" >&2
        status=1
      fi
    done
    git log -1 --format=%B "$sha" | scan_text "$short pesan" || status=1
  done
  return $status
}

case ${1:-} in
  --message-file) [ $# -eq 2 ] || usage; set -- scan_message "$2" ;;
  --text-file) [ $# -eq 2 ] || usage; set -- scan_text_file "$2" ;;
  --revs) [ $# -ge 2 ] || usage; shift; set -- scan_revs "$@" ;;
  *) usage ;;
esac

"$@" && exit 0

cat >&2 <<'EOF'

Ditolak: Summarevent tidak menerima atribusi AI (AGENTS.md bagian 1).
Hapus trailer, footer, atau identitas di atas, lalu ulangi:
  pesan commit terakhir    git commit --amend
  author commit terakhir   git commit --amend --reset-author --no-edit
  commit yang lebih lama   git rebase -i origin/main  (reword / edit)
EOF
exit 1
