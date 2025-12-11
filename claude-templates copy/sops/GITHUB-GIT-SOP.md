# GitHub & Git SOP for Claude Code

This SOP enables Claude Code to manage version control, create repositories, handle branches, and integrate with CI/CD workflows.

---

## Table of Contents

1. [Overview](#overview)
2. [Git Fundamentals](#git-fundamentals)
3. [GitHub CLI (gh)](#github-cli-gh)
4. [Branching Strategy](#branching-strategy)
5. [Commit Standards](#commit-standards)
6. [Pull Request Workflow](#pull-request-workflow)
7. [Repository Management](#repository-management)
8. [Integration Patterns](#integration-patterns)
9. [Troubleshooting](#troubleshooting)

---

## Overview

Claude Code uses Git and GitHub CLI for version control operations:

| Tool | Purpose |
|------|---------|
| `git` | Local version control |
| `gh` | GitHub API operations (PRs, issues, releases) |
| Bash | Command execution |

### Safety Protocols

Claude Code follows these Git safety rules:
- **NEVER** force push to main/master
- **NEVER** run `git push --force` without explicit user permission
- **NEVER** use interactive commands (`git rebase -i`, `git add -i`)
- **NEVER** skip hooks without explicit permission
- **ALWAYS** check authorship before amending commits
- **ALWAYS** commit with proper attribution

---

## Git Fundamentals

### Check Repository Status

```bash
# Current branch and status
git status

# Recent commits
git log --oneline -10

# All branches
git branch -a

# Remote URLs
git remote -v
```

### Stage and Commit Changes

```bash
# Stage specific files
git add path/to/file.js

# Stage all changes
git add .

# Commit with message (proper format)
git commit -m "$(cat <<'EOF'
Brief description of changes

Longer explanation if needed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Viewing Changes

```bash
# Unstaged changes
git diff

# Staged changes
git diff --staged

# Changes between branches
git diff main...feature-branch

# Changes in specific file
git diff path/to/file.js
```

### Working with Branches

```bash
# Create new branch
git checkout -b feature/new-feature

# Switch branches
git checkout main

# Delete local branch
git branch -d feature/old-branch

# Delete remote branch
git push origin --delete feature/old-branch
```

### Sync with Remote

```bash
# Fetch updates
git fetch origin

# Pull with rebase (preferred)
git pull --rebase origin main

# Push branch
git push -u origin feature/branch-name
```

---

## GitHub CLI (gh)

### Authentication Check

```bash
# Verify authentication
gh auth status

# Login if needed (interactive - user must do this)
gh auth login
```

### Repository Operations

```bash
# Clone repository
gh repo clone owner/repo

# Create new repository
gh repo create repo-name --public --description "Description"

# View repository info
gh repo view owner/repo

# List user's repositories
gh repo list --limit 20
```

### Pull Requests

```bash
# Create PR
gh pr create --title "Feature: Add new capability" --body "$(cat <<'EOF'
## Summary
- Added X functionality
- Fixed Y bug
- Updated Z documentation

## Test Plan
- [ ] Unit tests pass
- [ ] Manual testing complete

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

# List PRs
gh pr list

# View specific PR
gh pr view 123

# Check PR status
gh pr checks 123

# Merge PR
gh pr merge 123 --merge

# Close PR
gh pr close 123
```

### Issues

```bash
# Create issue
gh issue create --title "Bug: Something broken" --body "Description here"

# List issues
gh issue list

# View issue
gh issue view 123

# Close issue
gh issue close 123
```

### Releases

```bash
# Create release
gh release create v1.0.0 --title "Version 1.0.0" --notes "Release notes here"

# List releases
gh release list

# Download release assets
gh release download v1.0.0
```

### Viewing PR Comments

```bash
# View PR comments
gh api repos/owner/repo/pulls/123/comments

# View issue comments
gh api repos/owner/repo/issues/123/comments
```

---

## Branching Strategy

### Recommended Structure

```
main (or master)
  └── develop (optional staging branch)
       ├── feature/feature-name
       ├── fix/bug-description
       ├── hotfix/critical-fix
       └── chore/maintenance-task
```

### Branch Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feature/description` | `feature/user-authentication` |
| Bug Fix | `fix/description` | `fix/login-redirect-error` |
| Hotfix | `hotfix/description` | `hotfix/security-patch` |
| Chore | `chore/description` | `chore/update-dependencies` |
| Docs | `docs/description` | `docs/api-documentation` |
| Refactor | `refactor/description` | `refactor/database-queries` |

### Creating Feature Branch

```bash
# Ensure main is up to date
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/new-feature

# Work on feature...
# Commit changes...

# Push branch
git push -u origin feature/new-feature

# Create PR
gh pr create --title "Feature: New feature" --body "Description"
```

---

## Commit Standards

### Commit Message Format

```
<type>: <subject>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code style (formatting, semicolons, etc.) |
| `refactor` | Code refactoring |
| `test` | Adding/updating tests |
| `chore` | Maintenance tasks |
| `perf` | Performance improvements |

### Examples

```bash
# Feature
git commit -m "feat: add user authentication system"

# Bug fix
git commit -m "fix: resolve login redirect issue"

# Documentation
git commit -m "docs: update API documentation"

# With body
git commit -m "$(cat <<'EOF'
feat: add email notification system

- Implemented email templates
- Added SMTP configuration
- Created notification queue

Closes #123

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Claude Code Commit Protocol

When creating commits for users:

1. **Run parallel commands:**
   ```bash
   git status
   git diff
   git log --oneline -5
   ```

2. **Analyze changes and draft message**

3. **Create commit:**
   ```bash
   git add [relevant files]
   git commit -m "$(cat <<'EOF'
   [commit message]

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>
   EOF
   )"
   ```

4. **If pre-commit hook modifies files:**
   - Check authorship: `git log -1 --format='%an %ae'`
   - Verify not pushed: `git status`
   - Amend only if safe: `git commit --amend --no-edit`

---

## Pull Request Workflow

### Creating a Pull Request

```bash
# 1. Check status
git status
git diff main...HEAD

# 2. Push branch if needed
git push -u origin $(git branch --show-current)

# 3. Create PR
gh pr create --title "Feature: Description" --body "$(cat <<'EOF'
## Summary
- Change 1
- Change 2

## Test Plan
- [ ] Test case 1
- [ ] Test case 2

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### PR Description Template

```markdown
## Summary
<1-3 bullet points describing the changes>

## Changes
- `file1.js`: Description of changes
- `file2.js`: Description of changes

## Test Plan
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Screenshots (if applicable)
<Add screenshots for UI changes>

## Related Issues
Closes #123

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### Reviewing PR Status

```bash
# View PR details
gh pr view 123

# Check CI status
gh pr checks 123

# View diff
gh pr diff 123

# View comments
gh api repos/owner/repo/pulls/123/comments
```

### Merging PRs

```bash
# Merge with merge commit
gh pr merge 123 --merge

# Squash and merge
gh pr merge 123 --squash

# Rebase and merge
gh pr merge 123 --rebase

# Delete branch after merge
gh pr merge 123 --merge --delete-branch
```

---

## Repository Management

### Creating New Repository

```bash
# Create public repo
gh repo create my-new-repo --public --description "Description"

# Create private repo with README
gh repo create my-private-repo --private --add-readme

# Create from template
gh repo create my-repo --template owner/template-repo
```

### Repository Settings

```bash
# View repo settings
gh repo view owner/repo --json name,description,visibility

# Edit description
gh repo edit owner/repo --description "New description"

# Add topic
gh repo edit owner/repo --add-topic "topic-name"
```

### .gitignore Template

```gitignore
# Dependencies
node_modules/
vendor/

# Build outputs
dist/
build/
*.log

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Project specific
output/
temp/
uploads/
```

### README Template

```markdown
# Project Name

Brief description of the project.

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

## Configuration

Copy `.env.example` to `.env` and configure:

```
API_KEY=your-key-here
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT
```

---

## Integration Patterns

### Git + Hostinger Deployment

```markdown
## Workflow: Git Push → Hostinger VPS

1. **Commit and push changes**
   ```bash
   git add .
   git commit -m "feat: new feature"
   git push origin main
   ```

2. **Deploy to Hostinger VPS**
   Use `VPS_createNewProjectV1` with GitHub URL:
   ```json
   {
     "content": "https://github.com/owner/repo"
   }
   ```

3. **Or use webhook for auto-deploy**
   Configure GitHub webhook to trigger n8n workflow
```

### Git + n8n Integration

```markdown
## Workflow: Git → n8n Workflow Updates

1. **Store workflow JSON in repo**
   ```
   workflows/
   ├── main-workflow.json
   └── secondary-workflow.json
   ```

2. **Update workflow in repo**
   ```bash
   git add workflows/updated-workflow.json
   git commit -m "chore: update workflow logic"
   git push origin main
   ```

3. **Import to n8n**
   - Manual: Import JSON file
   - Automated: Use n8n API to update workflow
```

### GitHub Actions for Deployment

```yaml
# .github/workflows/deploy.yml
name: Deploy to Hostinger

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Deploy to VPS
        run: |
          # Trigger Hostinger deployment via API
          curl -X POST "https://your-webhook-url" \
            -H "Content-Type: application/json" \
            -d '{"repo": "${{ github.repository }}"}'
```

---

## Troubleshooting

### Common Issues

#### "Permission denied (publickey)"

```bash
# Check SSH key
ssh -T git@github.com

# If failed, use HTTPS instead
git remote set-url origin https://github.com/owner/repo.git
```

#### "Failed to push some refs"

```bash
# Usually means remote has changes
git pull --rebase origin main
git push origin main
```

#### "Merge conflict"

```bash
# View conflicting files
git status

# Open conflicting file and resolve manually
# Look for conflict markers: <<<<<<<, =======, >>>>>>>

# After resolving
git add resolved-file.js
git commit -m "fix: resolve merge conflict"
```

#### "Detached HEAD state"

```bash
# Create branch from current state
git checkout -b new-branch-name

# Or return to existing branch
git checkout main
```

### Recovery Commands

```bash
# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes)
git reset --hard HEAD~1

# Recover deleted branch
git reflog
git checkout -b recovered-branch <commit-hash>

# Revert specific commit
git revert <commit-hash>

# Stash changes temporarily
git stash
git stash pop
```

### Checking History

```bash
# Detailed log
git log --graph --oneline --all

# Search commits by message
git log --grep="keyword"

# Find who changed a line
git blame path/to/file.js

# Find when file was deleted
git log --diff-filter=D --summary | grep filename
```

---

## Quick Reference

### Daily Workflow

```bash
# Start of day
git checkout main
git pull origin main
git checkout -b feature/todays-work

# During work
git add .
git commit -m "wip: progress on feature"

# End of day
git push -u origin feature/todays-work
gh pr create --draft --title "WIP: Feature name"
```

### Essential Commands

| Task | Command |
|------|---------|
| Check status | `git status` |
| Stage all | `git add .` |
| Commit | `git commit -m "message"` |
| Push | `git push` |
| Pull | `git pull --rebase` |
| Create branch | `git checkout -b name` |
| Switch branch | `git checkout name` |
| View log | `git log --oneline -10` |
| Create PR | `gh pr create` |
| View PR | `gh pr view` |

### Git Config (One-time Setup)

```bash
# User info
git config --global user.name "Your Name"
git config --global user.email "your@email.com"

# Default branch name
git config --global init.defaultBranch main

# Rebase on pull
git config --global pull.rebase true

# Credential caching
git config --global credential.helper cache
```

---

## Integration Checklist

```markdown
## Project Setup Checklist

### Git Setup
- [ ] Repository created
- [ ] .gitignore configured
- [ ] README.md created
- [ ] Main branch protected (optional)

### GitHub Setup
- [ ] Repository visibility set
- [ ] Collaborators added
- [ ] Branch protection rules
- [ ] Webhooks configured (if needed)

### Integration Setup
- [ ] CI/CD workflows configured
- [ ] Deployment hooks set up
- [ ] n8n webhooks connected (if applicable)
- [ ] Hostinger deploy ready (if applicable)
```

---

*Last Updated: December 2025*
