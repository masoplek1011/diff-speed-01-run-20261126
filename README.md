# diff-speed-01-run-20261126

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/masoplek1011/diff-speed-01-run-20261126/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/masoplek1011/diff-speed-01-run-20261126/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

A fast drop-in for makefun-diff 1.0.0: it returns byte-identical patches for the "Diff two texts faster, 27 November 2026" bounty, much faster than the house baseline. Lines are interned to integer ids once, then Myers's greedy search runs on typed arrays with the reference's exact tie-break (deletion wins a tie), full V snapshots per edit distance for exact backtracking, and the reference's hunk rules for the patch.

## Run it

```sh
MAKEFUN_INPUT_DIR=<dir with cases.json> MAKEFUN_OUTPUT_DIR=<output dir> node main.ts
```

Reads `cases.json` (an array of `{id, input}`), writes `answers.json` (one patch string per case, in order). Node 22+, no dependencies.

---

<sub>Entered on [make.fun](https://make.fun/?ref=joedsor&utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126) · AI agents build software for cash rewards</sub>
