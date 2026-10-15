import type { CreatorEnvelope, Diagnostic } from "./creator";

export interface InstallerUiOptions { color: boolean; unicode: boolean; reducedMotion: boolean; width: number }
const ANSI = { reset: "\u001b[0m", bold: "\u001b[1m", dim: "\u001b[2m", yellow: "\u001b[33m", red: "\u001b[31m" };
const paint = (value: string, color: keyof typeof ANSI, options: InstallerUiOptions): string => options.color ? `${ANSI[color]}${value}${ANSI.reset}` : value;
export const detectUiOptions = (environment: NodeJS.ProcessEnv = process.env, width = Number(process.stderr.columns) || 80): InstallerUiOptions => {
  const locale = environment.LC_ALL ?? environment.LC_CTYPE ?? environment.LANG ?? "";
  return {
    color: environment.NO_COLOR === undefined && environment.TERM !== "dumb",
    unicode: environment.FACTORY_ASCII !== "1" && environment.TERM !== "dumb" && (!locale || /utf-?8/i.test(locale)),
    reducedMotion: environment.FACTORY_REDUCED_MOTION === "1" || environment.REDUCED_MOTION === "1",
    width: Math.max(40, Math.min(120, Number.isFinite(width) ? Math.floor(width) : 80)),
  };
};
export const renderWelcome = (options: InstallerUiOptions): string => `${paint("Agent Foundry installer", "bold", options)}\nExplicit Matt-first fresh setup; no automatic work or remote readiness checks.`;
const renderPreviewBytes = (encoded: string): string => {
  const bytes = Buffer.from(encoded, "base64");
  const text = bytes.toString("utf8");
  return bytes.equals(Buffer.from(text, "utf8")) ? JSON.stringify(text) : `base64:${encoded}`;
};
export const renderReview = (envelope: CreatorEnvelope, options: InstallerUiOptions): string => {
  const lines = [paint("Review exact plan", "bold", options), `Target: ${envelope.target}`, `Payload: ${envelope.payload.version} ${envelope.payload.digest}`,
    `Candidate: ${envelope.candidate?.candidate_digest ?? "unavailable"}`, `Configuration: ${envelope.config_digest ?? "unavailable"}`,
    `Acceptance: ${envelope.plan_digest ?? "unavailable: resolve conflicts"}`];
  lines.push(`Exact source/candidate: ${JSON.stringify(envelope.candidate ?? null)}`);
  lines.push(`Effective accepted configuration/binding/manual routes:\n${JSON.stringify(envelope.configuration ?? null, null, 2)}`);
  for (const entry of envelope.operations) {
    lines.push(`${entry.action} ${entry.path} mode=${entry.mode} bytes=${entry.size} sha256=${entry.sha256}`);
    if (entry.ownership) lines.push(`Scoped ownership/baseline:\n${JSON.stringify(entry.ownership, null, 2)}`);
    if (entry.preview) lines.push(`Before (JSON-escaped UTF-8 or base64): ${renderPreviewBytes(entry.preview.before)}`,
      `After (JSON-escaped UTF-8 or base64): ${renderPreviewBytes(entry.preview.after)}`);
  }
  if (envelope.effects) lines.push(`Local Git: ${envelope.effects.local_git}; external effects: none`, `Recovery: ${envelope.effects.recovery_baseline}`);
  if (envelope.effects) lines.push(`Exact local recovery effects:\n${JSON.stringify(envelope.effects, null, 2)}`);
  if (envelope.readiness) lines.push(`Readiness record: ${envelope.readiness.record}`, ...envelope.readiness.required.map((entry) => `External prerequisite (not checked): ${entry}`));
  return lines.join("\n");
};
export const renderDiagnostics = (diagnostics: Diagnostic[], options: InstallerUiOptions): string => diagnostics.map((item) => `${paint("!", "yellow", options)} ${item.code}: ${item.message}${item.path ? ` (${item.path})` : ""}`).join("\n");
export const renderCompletion = (envelope: CreatorEnvelope, options: InstallerUiOptions): string => {
  const headline = envelope.status === "cancelled" ? "Installation cancelled" : envelope.integrity === "verified"
    ? "File integrity verified; setup readiness not observed by installer" : ["planned", "dry-run"].includes(envelope.status)
      ? "Plan prepared; nothing applied" : "Installation needs attention";
  const lines = [paint(headline, "bold", options), `Status: ${envelope.status}; setup: ${envelope.setup}`];
  if (envelope.rollback) lines.push(`Recovery: ${envelope.rollback.message}`);
  if (envelope.next_action) lines.push(`Proposed next procedure: ${envelope.next_action.procedure}; NOT started. ${envelope.next_action.authority}`);
  return lines.join("\n");
};
