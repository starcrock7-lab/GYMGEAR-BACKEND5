---
name: safe-push
description: Commit and push only the intended files from a dirty working tree, and survive a diverged remote without losing anyone's work — targeted staging, rebase with autostash, deliberate per-file conflict resolution. Use when pushing docs or a fix from a tree with unrelated changes, when a push is rejected ("fetch first"), or when repos synced from multiple machines have diverged.
---

# Safe push from a messy tree

These repos are synced from multiple machines (sync .bat scripts, other sessions) — diverged remotes and dirty trees are normal, not exceptional. Never let a push sweep in work you didn't mean to ship or flatten work someone else pushed.

## Committing from a dirty tree
1. `git status --short` first — know what's dirty and whose it is. Pre-existing modifications you didn't make are **not yours to commit**.
2. Stage explicit paths only: `git add <file> <file>` — never `git add .`/`-A` on a dirty tree.
3. Deploy-affecting repos: commit with `-c user.email=starcrock7@gmail.com`.
4. Push.

## When the push is rejected (remote diverged)
1. **Look before resolving**: `git log --oneline HEAD..origin/main` and `git diff --stat main origin/main` — know what the remote actually adds. (Diverged docs here have turned out to be corrupted copies — mangled list markdown — but verify, don't assume.)
2. Prefer `git pull --rebase --autostash origin main`.
3. On conflicts, decide **per file** which side is authoritative and why:
   - your rewrite already contains the remote's addition → keep yours
   - remote has content yours lacks → merge it in properly
   - record the reasoning in the merge/commit message
4. If an uncommitted file blocks the merge, stash just that file (`git stash push -- <file>`), merge, `git stash pop`. A pop that reports no changes means the merge already contained the same edit — fine.
5. **Never `merge -s ours` blind** — it erases remote work invisibly (and the permission layer will block it). Resolve visibly with `git checkout --ours/--theirs <file>` inside a normal merge instead.
6. After pushing, run `git status --short` again and confirm the unrelated dirty files survived untouched.

## Abort criteria
Conflicts touch files you don't understand, or the remote contains real work you can't classify → stop, summarize both sides, ask.
