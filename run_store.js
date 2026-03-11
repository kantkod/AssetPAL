import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { ensureDir, writeJson, readJson } from "./io.js";

const RUNS_DIR = "./runs";

function pad(n) {
  return String(n).padStart(2, "0");
}

export function getShortGitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim() || "nogit";
  } catch {
    return "nogit";
  }
}

export function makeRunId(date = new Date(), gitSha = getShortGitSha()) {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${y}${m}${d}_${hh}${mm}${ss}_${gitSha || "nogit"}`;
}

export function createRunStore() {
  ensureDir(RUNS_DIR);
  const timestamp = new Date().toISOString();
  const gitSha = getShortGitSha();
  const runId = makeRunId(new Date(), gitSha);
  const runDir = path.join(RUNS_DIR, runId);
  ensureDir(runDir);

  return {
    runId,
    runDir,
    timestamp,
    gitSha,
    writeJson: (fileName, data) => writeJson(path.join(runDir, fileName), data),
    finalize: () => {
      writeJson(path.join(RUNS_DIR, "latest.json"), { runId });

      const indexPath = path.join(RUNS_DIR, "index.json");
      let current = [];
      if (fs.existsSync(indexPath)) {
        try {
          const parsed = readJson(indexPath);
          if (Array.isArray(parsed)) current = parsed;
        } catch {
          current = [];
        }
      }

      current.push({ runId, timestamp, gitSha });
      writeJson(indexPath, current);
    }
  };
}
