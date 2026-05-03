// Vitest configuration. The exclude list keeps stale claude-worktree
// copies from getting picked up alongside the canonical tests under
// `src/tests/` — without an exclude, both run in lockstep and a divergent
// fix (e.g. updated citations.js) only fails in the worktree, masking
// real regressions and inflating the test count.
export default {
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/worktrees/**',
    ],
  },
};
