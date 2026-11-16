#!/bin/sh
# 🔐 IP: nothing we commit or push may name a term from the owner's local denylist (the benchmark
# course's names). The list lives in the git-ignored guided-learning-topics/notes/denylist.txt, so
# the names never enter a tracked file. One term a line; blank lines and `#` comments are ignored.
# A term matches as a case-insensitive substring (a line "acme" also matches "acmecourse"), so list
# distinctive names, never short or common words. Matching is byte-wise (LC_ALL=C, so a binary file
# can't stop the scan): case-insensitive for ASCII letters only.
#
#   scripts/denylist-check.sh staged             staged added lines, and the names of added or
#                                                renamed files (.husky/pre-commit). During a merge,
#                                                only the person's resolution
#   scripts/denylist-check.sh msg <file>         a commit message, an early check that blocks but
#                                                skips comment lines (.husky/commit-msg)
#   scripts/denylist-check.sh range <revs…>      (a manual audit; no hook runs it) a revision
#                                                range: each commit's stored message,
#                                                added lines and added/renamed file names
#   scripts/denylist-check.sh push [remote]      pre-push's stdin (`<local ref> <local sha> <remote
#                                                ref> <remote sha>` lines), for the remote pushed to
#                                                (.husky/pre-push). The authority: it reads every new
#                                                commit's message as git stored it (an amended or
#                                                rebased one too), and covers commits no other hook
#                                                saw (cherry-pick, rebase, `git am`, a merge)
#
# Local and git only (owner 2026-11-16). Not checked: PR titles, bodies and comments published with
# gh (shell commands can't be parsed reliably enough to prove what gh would send), and anything that
# skips local hooks (a clone without the list, `--no-verify`, GitHub's web editor, a squash-merge
# subject). Write those by the lesson-authoring skill.
#
# New text only (owner's review loop, 2026-11-16): a diff's lines that are already public (on
# origin, in a picked or reverted commit, on a merged-in side) are not the person's and don't block.
# So a cherry-pick, a revert or a merge can bring an old public mention back into a branch's files;
# the check stops new names, the lesson-authoring skill's review covers what comes back. Commit
# messages are always new text: a revert's or a pick's message repeats an old subject in a new
# commit, so edit it (`git revert --edit`, `git cherry-pick --edit`) when that subject names a term.
#
# Added lines only: removing a mention, editing a file whose name already holds one, or deleting it
# is always allowed. Binary files are read as raw bytes with NUL bytes removed, so plain text inside
# them is caught (uncompressed metadata, a UTF-16 file). Compressed text isn't: most PDF page text,
# .docx/.xlsx (zip), PNG zTXt/iTXt, .svgz, and text drawn inside an image. Don't commit such files
# about the benchmark; the lesson-authoring skill keeps its material git-ignored. If git fails,
# the check blocks rather than pass with nothing scanned. Warnings go to stderr. A missing list warns
# rather than blocks: a fresh clone has no notes. DENYLIST_FILE overrides the list's location (the
# tests).

export LC_ALL=C
# No filename globbing: arguments like --remotes=origin/* are git's patterns, never the shell's
set -f

warn() { echo "⚠️  $*" >&2; }

if [ -n "$DENYLIST_FILE" ]; then
  LIST=$DENYLIST_FILE
else
  # The checkout this script lives in, else the main checkout: a worktree under .claude/worktrees/
  # has no git-ignored notes of its own, and the main checkout is the git common dir's parent
  HERE=$(cd "$(dirname "$0")/.." && pwd)
  LIST="$HERE/guided-learning-topics/notes/denylist.txt"
  if [ ! -f "$LIST" ]; then
    COMMON=$(cd "$HERE" && cd "$(git rev-parse --git-common-dir 2>/dev/null)" 2>/dev/null && pwd)
    [ -n "$COMMON" ] && LIST="$(dirname "$COMMON")/guided-learning-topics/notes/denylist.txt"
  fi
fi

if [ ! -f "$LIST" ]; then
  warn "No denylist at $LIST: the benchmark-name check is skipped."
  exit 0
fi

# Strip Windows line endings and surrounding spaces; drop blank and comment lines
# (and a UTF-8 byte-order mark an editor may write at the start)
BOM=$(printf '\357\273\277')
TERMS=$(tr -d '\r' < "$LIST" | sed "1s/^$BOM//;s/^[[:space:]]*//;s/[[:space:]]*\$//" |
  grep -v '^$' | grep -v '^#')
[ -z "$TERMS" ] && exit 0

blocked() {
  echo "❌ $1 names a term from the local denylist. Say 'the benchmark course' instead." >&2
  exit 1
}

git_failed() {
  echo "❌ git failed while reading $1, so nothing could be checked: $2" >&2
  exit 1
}

# What to scan from a -U0 patch: the `+` lines inside hunks (never a `+++` header, always a content
# line starting with "++"), the names of added or renamed files, and — from `range` — each commit
# message, which sits between \001 markers so no message line can be mistaken for a diff line. NUL
# bytes are removed first: awk ends a line at a NUL, and a binary or UTF-16 file must not hide text
# after one.
added_lines() {
  tr -d '\000' | awk '
    # A name git quoted (a `"`, `\\`, tab or newline in it): drop the quotes and an a/ or b/ prefix,
    # and read the escapes back
    function unq(q,   out, i, c, n) {
      q = substr(q, 2, length(q) - 2)
      if (q ~ /^[ab]\//) q = substr(q, 3)
      out = ""
      for (i = 1; i <= length(q); i++) {
        c = substr(q, i, 1)
        if (c == "\\" && i < length(q)) {
          n = substr(q, ++i, 1)
          if (n ~ /[0-7]/) {
            # \NNN: an octal byte
            c = (n * 64) + (substr(q, i + 1, 1) * 8) + substr(q, i + 2, 1)
            c = sprintf("%c", c)
            i += 2
          } else if (n == "t") c = "\t"; else if (n == "n") c = "\n"; else if (n == "r") c = "\r"
          else if (n == "a") c = "\007"; else if (n == "b") c = "\b"; else if (n == "f") c = "\f"
          else if (n == "v") c = "\v"; else c = n
        }
        out = out c
      }
      return out
    }
    /^\001MSG$/      { msg = 1; next }
    /^\001END$/      { msg = 0; next }
    msg              { print; next }
    # `diff --git a/P b/P`: the path P, whatever spaces it holds (both halves are equal for a new
    # file, so it is half of what follows "diff --git a/" minus " b/")
    /^diff --git "/  { hunk = 0; rest = substr($0, 12); path = unq(substr(rest, 1, (length(rest) - 1) / 2)); next }
    /^diff --git /   { hunk = 0; rest = substr($0, 14); path = substr(rest, 1, (length(rest) - 3) / 2); next }
    # New names only: an added or renamed file (never a modified or deleted one)
    !hunk && /^new file mode / { print path; next }
    !hunk && /^rename to "/    { sub(/^rename to /, ""); print unq($0); next }
    !hunk && /^rename to /     { sub(/^rename to /, ""); print; next }
    /^@@ /           { hunk = 1; next }
    hunk && /^\+/    { print substr($0, 2) }
  '
}

# The diff options every mode uses: unquoted paths (an accented name reads as itself), no textconv
# or external drivers (they would change what is scanned), binary files as text, and the a/ b/
# prefixes the name reader expects whatever diff.noprefix or diff.srcPrefix/dstPrefix say. Renames
# are detected (moving a file adds no text); copies are not, so a copied file's whole text counts as
# added.
DIFF_OPTS="--no-color --no-ext-diff --no-textconv --text -U0 -M --src-prefix=a/ --dst-prefix=b/"

# The term hits of one side's patch (stdin), kept only if every earlier side had them too: a line
# counts as new only when it is added relative to every side. Call `: > "$TMP/common"` and set
# FIRST=1 before the first side.
keep_common() {
  added_lines | grep -iF -e "$TERMS" | sort -u > "$TMP/hits"
  if [ -n "$FIRST" ]; then
    mv "$TMP/hits" "$TMP/common"
    FIRST=
  else
    comm -12 "$TMP/common" "$TMP/hits" > "$TMP/both" && mv "$TMP/both" "$TMP/common"
  fi
}

# Whether this git is at least 2.<minor>: remerge diffs arrived in 2.36, `patch-id --verbatim` in 2.39
git_at_least() {
  v=$(git version | sed 's/^git version //')
  major=${v%%.*}
  rest=${v#*.}
  minor=${rest%%.*}
  case "$major$minor" in '' | *[!0-9]*) return 1 ;; esac
  [ "$major" -gt 2 ] || { [ "$major" -eq 2 ] && [ "$minor" -ge "$1" ]; }
}

# Scan a history walk: messages (when $1 is a --format with them), added lines and new file names.
# A merge shows only what was changed while merging (a remerge diff against git's automatic merge):
# its conflict resolution, never the merged-in side's own lines. An unknown revision (a remote
# commit this clone hasn't fetched) blocks, never passes with nothing scanned.
scan_log() {
  QUIET=
  if [ "$1" = --quiet ]; then
    QUIET=1
    shift
  fi
  fmt=$1
  shift
  # A git older than 2.36 has no remerge diffs: each merge is then shown against each parent (-m),
  # which may block a merged-in side's own lines, but never passes one unscanned
  DM=--diff-merges=remerge
  git_at_least 36 || DM=-m
  # --stdin's revision list is read twice (the log, then the octopus merges)
  case " $* " in *" --stdin "*) cat > "$TMP/scan-revs" ;; *) : > "$TMP/scan-revs" ;; esac
  git -c core.quotePath=false log -p --root $DIFF_OPTS $DM --format="$fmt" "$@" < "$TMP/scan-revs" \
    > "$TMP/patch" || git_failed "the commits ($*)" "check the revisions (when pushing: fetch first)"
  if added_lines < "$TMP/patch" | grep -qiF -e "$TERMS"; then
    [ -n "$QUIET" ] && return 1
    blocked "A commit (its message, an added line or a file name)"
  fi
  # An octopus merge (3+ parents) has no remerge diff: what it adds itself is a line added relative
  # to every parent
  git rev-list --min-parents=3 "$@" < "$TMP/scan-revs" > "$TMP/octopus" ||
    git_failed "the commits ($*)" "check the revisions (when pushing: fetch first)"
  while read -r merge; do
    FIRST=1
    for parent in $(git rev-list --parents -n 1 "$merge" | cut -d' ' -f2-); do
      git -c core.quotePath=false diff $DIFF_OPTS "$parent" "$merge" > "$TMP/opatch" ||
        git_failed "the merge $merge" "check the revisions"
      keep_common < "$TMP/opatch"
    done
    if [ -s "$TMP/common" ]; then
      [ -n "$QUIET" ] && return 1
      blocked "A merge (a line or file name it adds itself)"
    fi
  done < "$TMP/octopus"
  return 0
}

TMP=$(mktemp -d) || exit 1
trap 'rm -rf "$TMP"' EXIT

case "$1" in
  staged)
    # During a merge, or a cherry-pick, revert or rebase stopped on a conflict, a line or new file name
    # counts only if it is added relative to every side: HEAD, and each MERGE_HEAD (or the picked
    # commit, the rebased commit, or the reverted commit's parents: `revert -m N` restores parent N). What any side already has isn't the person's; their
    # own resolution is in none of them. `merge --squash` leaves no head and is compared with HEAD;
    # pre-push treats its text like any other commit's. Outside these, plain `diff --cached` (which
    # also handles a repo's very first commit).
    : > "$TMP/others"
    MERGE_HEAD_FILE=$(git rev-parse --git-path MERGE_HEAD)
    if [ -f "$MERGE_HEAD_FILE" ]; then
      cat "$MERGE_HEAD_FILE" > "$TMP/others"
    elif git rev-parse -q --verify CHERRY_PICK_HEAD > /dev/null; then
      echo CHERRY_PICK_HEAD > "$TMP/others"
    elif git rev-parse -q --verify 'REVERT_HEAD^' > /dev/null; then
      git rev-list --parents -n 1 REVERT_HEAD | cut -d' ' -f2- | tr ' ' '\n' > "$TMP/others"
    elif git rev-parse -q --verify REBASE_HEAD > /dev/null; then
      echo REBASE_HEAD > "$TMP/others"
    fi
    if [ -s "$TMP/others" ]; then
      FIRST=1
      for side in HEAD $(cat "$TMP/others"); do
        git -c core.quotePath=false diff --cached $DIFF_OPTS "$side" > "$TMP/patch" ||
          git_failed "the merge" "finish or abort it, then commit again"
        keep_common < "$TMP/patch"
      done
      [ -s "$TMP/common" ] && blocked "A staged change or file name"
      exit 0
    fi
    git -c core.quotePath=false diff --cached $DIFF_OPTS > "$TMP/patch" ||
      git_failed "the staged changes" "fix the index and commit again"
    if added_lines < "$TMP/patch" | grep -qiF -e "$TERMS"; then
      blocked "A staged change or file name"
    fi
    ;;
  msg)
    # An early check, not the authority: the pre-push check reads each message exactly as git stored
    # it, whatever the cleanup mode or language. Here, everything above `git commit -v`'s scissors
    # line, without the template's comment lines (core.commentString / core.commentChar, `#` by
    # default), so the editor template (in any language) never blocks a clean message.
    CC=$(git config core.commentString 2>/dev/null || git config core.commentChar 2>/dev/null)
    [ -z "$CC" ] && CC='#'
    [ -r "$2" ] || git_failed "the commit message" "no readable message file was given"
    # git's scissors line is the comment character, a space, then `-…- >8 -…-`; everything below it
    # is the `git commit -v` diff. Only that exact line cuts (a message may hold a look-alike).
    CC="$CC" awk '
      BEGIN { c = ENVIRON["CC"]; d = " ------------------------ >8 ------------------------" }
      c == "auto" && length($0) == length(d) + 1 && index("#;@!$%^&|:", substr($0, 1, 1)) &&
        substr($0, 2) == d { exit }
      c != "auto" && $0 == c d { exit }
      { print }
    ' "$2" > "$TMP/msg" || git_failed "the commit message" "it can't be read"
    # The template's lines are the comment character alone, or followed by a space or a tab (git's
    # own form). Only those are skipped: `#12 …` from `git commit -m` is message text that git keeps.
    # With `auto`, git picks the first of `#;@!$%^&|:` that no line starts with: any of them counts.
    CC="$CC" awk '
      BEGIN { c = ENVIRON["CC"] }
      c == "auto" && /^[#;@!$%^&|:]([ \t]|$)/ { next }
      c != "auto" && ($0 == c || index($0, c " ") == 1 || index($0, c "\t") == 1) { next }
      { print }
    ' "$TMP/msg" > "$TMP/kept"
    if grep -qiF -e "$TERMS" "$TMP/kept"; then
      blocked "The commit message"
    fi
    if grep -qiF -e "$TERMS" "$TMP/msg"; then
      warn "A comment line in the commit message names a term from the local denylist. If git keeps" \
        "it (git commit -m, --cleanup=verbatim), the pre-push check will block this commit."
    fi
    ;;
  range)
    shift
    # One history walk for messages, added lines and new file names (the messages fenced off by \001
    # markers, so a line that quotes a patch header can't hide the rest)
    scan_log '%x01MSG%n%B%n%x01END' "$@"
    ;;
  push)
    # What counts as already public: the refs of the remote pushed to (pre-push's $1) and of
    # `origin`, the public repository: a commit that sits only on another remote (a backup, a fork)
    # is still checked before it reaches this one, and what origin already has never blocks a push to
    # a mirror. A remote with no refs yet (an empty repository, a URL) falls back to origin's refs
    # alone: another remote may be private (a backup), so what it holds is still checked. With no
    # origin refs, everything is new.
    REMOTE=$2
    PUBLIC=
    if [ -n "$REMOTE" ] && git remote | grep -qxF -e "$REMOTE" &&
      [ -n "$(git for-each-ref --count=1 "refs/remotes/$REMOTE")" ]; then
      PUBLIC="--remotes=$REMOTE/*"
      if [ "$REMOTE" != origin ] && [ -n "$(git for-each-ref --count=1 refs/remotes/origin)" ]; then
        PUBLIC="$PUBLIC --remotes=origin/*"
      fi
    elif [ -n "$(git for-each-ref --count=1 refs/remotes/origin)" ]; then
      PUBLIC="--remotes=origin/*"
    fi
    # An all-zero object id (40 zeros with SHA-1, 64 with SHA-256) means "no commit"
    is_zero() { case "$1" in '' | *[!0]*) return 1 ;; *) return 0 ;; esac; }
    cat > "$TMP/refs"
    # The remote's tips this clone has (a force-push over a commit never fetched names one it
    # doesn't: the remote's refs still mark what's public)
    KNOWN_ALL=
    while read -r local_ref local_sha remote_ref remote_sha; do
      if ! is_zero "$remote_sha" && git cat-file -e "$remote_sha^{commit}" 2>/dev/null; then
        KNOWN_ALL="$KNOWN_ALL $remote_sha"
      fi
    done < "$TMP/refs"
    # Pass 1: each ref's new commits. Every message (and an annotated tag's) is checked here, since
    # an amended message changes no patch, each commit once however many refs share it; the
    # non-merge commits are collected for the patch ids. A new ref's own name is checked too: a
    # branch or tag name is published with the push (and later in merge subjects).
    : > "$TMP/nonmerges"
    : > "$TMP/seen"
    n=0
    while read -r local_ref local_sha remote_ref remote_sha; do
      n=$((n + 1))
      : > "$TMP/new.$n"
      [ -z "$local_sha" ] && continue
      is_zero "$local_sha" && continue # a deleted branch pushes no commits
      if is_zero "$remote_sha" && printf '%s\n' "$remote_ref" | grep -qiF -e "$TERMS"; then
        blocked "The name of the ref being pushed"
      fi
      # An annotated tag's message, and each inner tag's when it points at another tag
      obj=$local_sha
      while [ "$(git cat-file -t "$obj" 2>/dev/null)" = tag ]; do
        git cat-file -p "$obj" | sed '1,/^$/d' | grep -qiF -e "$TERMS" &&
          blocked "The tag being pushed ($local_ref)"
        obj=$(git cat-file -p "$obj" | sed -n 's/^object //p;/^$/q')
      done
      KNOWN=
      case " $KNOWN_ALL " in *" $remote_sha "*) KNOWN=$remote_sha ;; esac
      # The commits new to the remote pushed to
      git rev-list "$local_sha" --not $KNOWN $PUBLIC > "$TMP/new.$n" ||
        git_failed "the pushed commits" "fetch first, then push again"
      # The commits no earlier ref brought: each is read once
      grep -vxF -f "$TMP/seen" "$TMP/new.$n" > "$TMP/new.$n.tmp" || true
      mv "$TMP/new.$n.tmp" "$TMP/new.$n"
      [ -s "$TMP/new.$n" ] || continue
      cat "$TMP/new.$n" >> "$TMP/seen"
      git log --no-walk --format=%B --stdin < "$TMP/new.$n" > "$TMP/messages" ||
        git_failed "the pushed commits" "fetch first, then push again"
      grep -qiF -e "$TERMS" "$TMP/messages" &&
        blocked "A commit message being pushed (a revert's or a pick's repeats the old subject: reword it)"
      git rev-list --no-walk --no-merges --stdin < "$TMP/new.$n" >> "$TMP/nonmerges" ||
        git_failed "the pushed commits" "fetch first, then push again"
    done < "$TMP/refs"
    # The diffs of every ref's new commits (each once; pass 1 read the messages), scanned first: a
    # clean push ends here, without the patch-id work below
    [ -s "$TMP/seen" ] || exit 0
    scan_log --quiet '' --no-walk --stdin < "$TMP/seen" && exit 0
    # A rebase rewrites commit ids, not changes: a commit whose exact patch is already public (the
    # same patch id as a commit there, e.g. its copy before the rebase, or reversed: a revert) brings
    # no new text, so its diff is left out. Merges have no patch id and are always
    # scanned. Both sides' patches are read the way the scan reads them (no textconv or diff
    # drivers, binary as text, no rename pairing), and `--verbatim`: the default patch id ignores
    # whitespace, so "acme course" and "acmecourse" would look alike. The public side is only what
    # the remote's tips of the pushed refs and origin's main and develop hold (a cherry-pick of a
    # commit on origin is a copy too; a reverted commit is usually in the branch's own history),
    # their most recent 1,000 commits on the files the new
    # commits touch (a copy touches the same files); each side is read once for the whole push. A
    # path git would quote (a `"`, `\` or newline in it) can't be matched that way, so its commits
    # are simply scanned.
    # patch-id reads `commit <full id>` headers: the format is pinned (log.abbrevCommit, format.pretty
    # and log.showRoot can't change it)
    PATCH_OPTS="--root --no-merges --format=commit%x20%H --no-color --no-ext-diff --no-textconv --text --no-renames --src-prefix=a/ --dst-prefix=b/"
    : > "$TMP/known-patches"
    # The public side is the remote's tips of the pushed refs plus origin's main and develop (where
    # a copy's original lives), never every stale origin/* branch
    PUBLIC_SIDE=$KNOWN_ALL
    for branch in main develop; do
      git rev-parse -q --verify "refs/remotes/origin/$branch" > /dev/null &&
        PUBLIC_SIDE="$PUBLIC_SIDE refs/remotes/origin/$branch"
    done
    # A git older than 2.39 has no verbatim patch ids: no copy is skipped then (all scanned)
    if [ -s "$TMP/nonmerges" ] && [ -n "$PUBLIC_SIDE" ] && git_at_least 39; then
      sort -u "$TMP/nonmerges" > "$TMP/nonmerges.u"
      git -c core.quotePath=false diff-tree --stdin --root -r --no-commit-id --name-only \
        --no-renames < "$TMP/nonmerges.u" > "$TMP/paths" ||
        git_failed "the pushed commits" "fetch first, then push again"
      sort -u "$TMP/paths" | grep -v '^"' | sed 's/^/:(literal)/' > "$TMP/pathspecs" || true
      # No path left (all quoted): nothing to compare, and git log with no pathspec would read the
      # remote's whole history
      if [ -s "$TMP/pathspecs" ]; then
        tr '\n' '\000' < "$TMP/pathspecs" |
          xargs -0 git log -p --full-diff $PATCH_OPTS --max-count=1000 $PUBLIC_SIDE -- \
            > "$TMP/public-patches" || git_failed "the public commits" "fetch first, then push again"
        git patch-id --verbatim < "$TMP/public-patches" | cut -d' ' -f1 | sort -u > "$TMP/public-ids"
        if [ -s "$TMP/public-ids" ]; then
          # Each commit's patch, and its reverse: a revert re-adds what a public commit removed (-R
          # swaps the a/ b/ prefixes too, so they're swapped back for the same patch id)
          { git log -p --no-walk $PATCH_OPTS --stdin < "$TMP/nonmerges.u" &&
            git log -p -R --no-walk $PATCH_OPTS --src-prefix=b/ --dst-prefix=a/ --stdin \
              < "$TMP/nonmerges.u"; } \
            > "$TMP/new-patches" || git_failed "the pushed commits" "fetch first, then push again"
          git patch-id --verbatim < "$TMP/new-patches" |
            awk 'NR == FNR { pub[$1]; next } ($1 in pub) { print $2 }' "$TMP/public-ids" - \
            > "$TMP/known-patches"
        fi
      fi
    fi
    # Pass 2: a hit, so the copies are left out and the rest is scanned again, now blocking
    grep -vxF -f "$TMP/known-patches" "$TMP/seen" > "$TMP/check" || true
    [ -s "$TMP/check" ] && scan_log '' --no-walk --stdin < "$TMP/check"
    ;;
  *)
    echo "usage: $0 staged | msg <file> | range <revs…> | push [remote]" >&2
    exit 2
    ;;
esac
exit 0
