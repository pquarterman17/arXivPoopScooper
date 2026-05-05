# Branch Protection Setup for `main`

Enable these rules once to enforce the PR-based workflow. Direct pushes to `main` will be blocked; all changes must go through a pull request that passes CI.

## Steps

1. Go to **Settings** → **Branches** → **Add branch protection rule**

2. Set **Branch name pattern**: `main`

3. Check **Require a pull request before merging**
   - Check **Require approvals** and set the count to **0**
   - (Solo developer: this still enforces the PR flow even without a second reviewer. The point is that the branch must exist and CI must pass before the merge lands.)

4. Check **Require status checks to pass before merging**
   - Search for and add each of these required checks:
     - `lint (ruff)`
     - `vitest (frontend)`
     - `pytest (scq)`
     - `e2e smoke (scq serve)`
   - Check **Require branches to be up to date before merging**
   - (These check names must match the `name:` field in `.github/workflows/test.yml` exactly. If you rename a job, update the protection rule to match.)

5. Leave **Restrict who can push to matching branches** unchecked (solo developer).

6. Click **Create**.

## What this means day-to-day

- `git push origin main` will be rejected. All changes go through feature branches and PRs.
- The `--no-edit` merge workflow still works: create a PR with `gh pr create`, then merge it with `gh pr merge --merge --auto`. GitHub enforces the checks automatically.
- The DAG enforced by `needs:` in the workflow means CI minutes are not wasted running tests when linting fails.

## Emergency bypass

If you need to land a hotfix without CI (e.g., the DB is corrupted and you need to push a migration fast):

**Option A — Temporary rule edit:**
Settings → Branches → edit the `main` rule → temporarily uncheck "Require status checks to pass" → merge → re-enable.

**Option B — Admin override:**
On the PR merge page, click "Merge without waiting for requirements to be met (bypass branch protections)". This is only available to repo admins and leaves a permanent audit trail in the PR.

Use Option B for true emergencies; Option A for planned maintenance windows.
