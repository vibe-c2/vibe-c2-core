Publish a new version of this Go package to GitHub as a tagged release.

Follow these steps:

0. **Commit** - commit if uncommited changes presented.

1. **Pre-flight checks** — run `go build ./...`, `go vet ./...`, and `go test ./...`. If any fail, stop and report the issue. Do NOT proceed.

2. **Determine next version** — look at existing git tags (`git tag --sort=-v:refname`) to find the latest semver tag. Analyze commits since that tag (`git log <latest_tag>..HEAD --oneline`) to understand what changed. Based on the changes, propose the next version using semver:
   - **patch** (x.y.Z) — bug fixes, minor tweaks
   - **minor** (x.Y.0) — new features, non-breaking changes
   - **major** (X.0.0) — breaking API changes
   Show the user the commit log since the last tag and your recommended version. Ask the user to confirm or pick a different version bump level (patch/minor/major).

3. **Wait for user confirmation** — do NOT proceed until the user explicitly accepts the proposed version.

4. **Push branch and tag** — once confirmed:
   - Push the current branch to origin first: `git push origin <current-branch>` — the tag must belong to a branch on the remote, otherwise GitHub shows "This commit does not belong to any branch".
   - Create an annotated git tag: `git tag -a v<version> -m "Release v<version>"`
   - Push the tag to origin: `git push origin v<version>`
   - Report the published version and the tag URL.

If `$ARGUMENTS` is provided, treat it as the desired version (e.g., `/publish v0.7.0` or `/publish 0.7.0`) — skip the version proposal step but still run pre-flight checks and ask user to confirm before tagging.
