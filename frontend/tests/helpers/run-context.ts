// Generic, reusable run-context utility — not BeautyFolio-specific. Any
// project adapter can call buildRunContext() to stamp its test output with
// "which run was this." Deliberately minimal: no report generation, no file
// I/O — later QA phases can consume this shape to build a full report.
import { execFileSync } from "node:child_process";

export interface RunContext {
  runId: string;
  timestamp: string;
  project: string;
  environment: string;
  commitSha: string | null;
}

/** Best-effort short commit SHA of HEAD; null if git isn't available or this
 * isn't a git checkout (never throws — a missing SHA shouldn't fail a run). */
function resolveCommitSha(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export interface BuildRunContextInput {
  project: string;
  environment?: string;
}

export function buildRunContext(input: BuildRunContextInput): RunContext {
  return {
    runId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    project: input.project,
    environment: input.environment ?? process.env["QA_ENVIRONMENT"] ?? "local",
    commitSha: resolveCommitSha(),
  };
}
