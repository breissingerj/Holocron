---
name: review-pr
description: Comprehensive workflow for reviewing Pull Requests. Use this skill when the user asks to "review a PR" or "check changes".
allowed-tools: Bash, Read, Grep, Glob, Task
---

# Pull Request Review Workflow

This skill outlines the standard operating procedure for reviewing code changes in a Pull Request.

## 1. Context & Setup

**Goal:** Establish a clean environment and understand the scope of changes without interrupting ongoing development.

```bash
# Create a new worktree for the PR to avoid changing the current branch
git worktree add ../pr-<PR_NUMBER> -d

# NOTE: For all subsequent commands (like checkout, tests, etc.), 
# make sure to run them within the new worktree directory (e.g. using the workdir parameter).

# In the new worktree, checkout the PR
# (Run this with workdir set to the new worktree path)
gh pr checkout <PR_NUMBER>

# Fetch PR metadata (Title, Body, Files)
gh pr view <PR_NUMBER> --json title,body,files --template 'Title: {{.title}}
Body: {{.body}}
Files:
{{range .files}}- {{.path}}
{{end}}'
```

## 2. Impact Analysis

**Goal:** Determine what the changes actually do, how they affect the system, and identify potential risks.

### Core Logic Review

- **Read Changed Files**: Use `Read` to examine modifications.
- **Verify Intent**: Does the code match the PR description?
- **Edge Cases**: Are boundary conditions handled?

### Risk Assessment

- **Regressions**: Could existing functionality break?
- **Security**: Are there new vulnerabilities (e.g., input validation, auth checks)?
- **Breaking Changes**: Do API contracts or database schemas change?

### Application Flow Analysis

- **Invocation Path**: explicit trace of where the changes are invoked within the application execution (e.g., "Invoked by the checkout button onClick handler," "Called by the nightly cron job," or "Triggered via the /api/v1/users endpoint").
- **Entry Points**: Identify how the changed code is reached.
- **Data Flow**: Trace how data moves through the modified components.
- **Dependencies**: Check for changes in shared libraries or external services.
- **Side Effects**: Consider potential unintended consequences (e.g., performance regressions, state mutations).

## 3. Verification Strategy

**Goal:** Prove the changes work as intended.

- **Check CI/CD Status**: Review GitHub Actions/Checks for test failures or linting errors.
  ```bash
  gh pr checks <PR_NUMBER>
  ```
- **Coverage Check**: Ensure new logic has corresponding tests in the codebase.
- **Do NOT run tests locally**: Rely on the automated CI pipeline unless the user explicitly requests you to run tests locally or test the application manually.

## 4. Final Report

**Goal:** Provide a concise, actionable summary to the user.

Structure your report as follows:

### Summary of Impact

[What does this PR change? What features or fixes are included?]

### Risk Assessment

[Are there any potential regressions, security risks, or breaking changes?]

### Execution Impact

[Briefly describe where the changes are invoked within the application execution (e.g., "These changes are invoked when a user clicks 'Submit' on the registration form, triggering the 'createUser' API endpoint."). Explain the application flow affected.]

### Detailed Observations

- **Correctness**: [Is the logic sound?]
- **Coverage**: [Are tests sufficient?]
- **Safety**: [Security/Performance risks?]
- [Specific feedback points]

### Worktree Status

[Mention that the PR was checked out in a separate worktree (provide the path) so the user's current branch was undisturbed. Give the user instructions on how to clean it up when they're done (e.g., `git worktree remove ../pr-<PR_NUMBER>`)]
