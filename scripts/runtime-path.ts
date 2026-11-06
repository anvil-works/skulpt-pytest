import { resolve } from "node:path";
// Local development uses an existing build; CI builds the pinned prerequisite tip.
export const runtimeDist = resolve(process.env.SKULPT_DIST ?? "../skulpt/dist");
