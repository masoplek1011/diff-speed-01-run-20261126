// Entry driver for the "Diff two texts faster" bounty (program/v1).
// Node 22 runs this file directly. It loads every case from the input
// directory, answers each one with run() from solve.js, and drops the
// answers, in the cases' order, into the output directory as answers.json.
//
// The input/output locations come from MAKEFUN_INPUT_DIR and
// MAKEFUN_OUTPUT_DIR when set (the harness mounts /input and /output
// there in the container); otherwise they default to those paths.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// Keep V8 from doing incremental marking while the diff runs: the
// reference entry is timed with this flag off, and entries may tune
// the same flag. It has to be set before solve.js is loaded.
setFlagsFromString('--no-incremental-marking');

const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as {
  id: string;
  input: unknown;
}[];

const answers: unknown[] = [];
for (const c of cases) answers.push(run(c.input));

writeFileSync(join(OUTPUT_DIR, 'answers.json'), JSON.stringify(answers));
