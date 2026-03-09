import path from "path";
import fs from "fs";
import { ensureDir, writeJson, nowStamp } from "./io.js";

export function makeRunDir(name="run") {
  const stamp = nowStamp();
  const dir = path.join("./results/runs", `${stamp}_${name}`);
  ensureDir(dir);
  // update latest pointer
  ensureDir("./results/runs/latest");
  fs.writeFileSync("./results/runs/latest/_LATEST.txt", dir);
  return dir;
}

export function writeSummary(runDir, filename, obj) {
  writeJson(path.join(runDir, filename), obj);
  // also mirror to latest folder for convenience
  writeJson(path.join("./results/runs/latest", filename), obj);
}
