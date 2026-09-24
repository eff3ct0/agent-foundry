import type { CreatorEnvelope, Diagnostic, Operation, Placeholder } from "./creator";

export interface InstallerUiOptions {
  color: boolean;
  unicode: boolean;
  reducedMotion: boolean;
  width: number;
}

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
};

const paint = (value: string, color: keyof typeof ANSI, options: InstallerUiOptions): string =>
  options.color ? `${ANSI[color]}${value}${ANSI.reset}` : value;

const glyph = (options: InstallerUiOptions, unicode: string, ascii: string): string => options.unicode ? unicode : ascii;

export const detectUiOptions = (
  environment: NodeJS.ProcessEnv = process.env,
  width = Number(process.stderr.columns) || 80,
): InstallerUiOptions => {
  const noColor = environment.NO_COLOR !== undefined || environment.TERM === "dumb";
  const locale = environment.LC_ALL ?? environment.LC_CTYPE ?? environment.LANG ?? "";
  const unicode = environment.FACTORY_ASCII !== "1" && (environment.TERM !== "dumb" && (!locale || /utf-?8/i.test(locale)));
  return {
    color: !noColor,
    unicode,
    reducedMotion: environment.FACTORY_REDUCED_MOTION === "1" || environment.REDUCED_MOTION === "1",
    width: Math.max(40, Math.min(120, Number.isFinite(width) ? Math.floor(width) : 80)),
  };
};

export const renderWelcome = (options: InstallerUiOptions): string => [
  paint("Agent Foundry installer", "bold", options),
  paint("Prepare a repository from the packaged template", "dim", options),
].join("\n");

export const renderStep = (current: number, total: number, label: string, options: InstallerUiOptions): string => {
  const marker = options.reducedMotion ? glyph(options, "◆", ">") : glyph(options, "●", ">>");
  return `${paint(`${marker} Step ${current}/${total}`, "cyan", options)} ${label}`;
};

export const renderSelection = (
  placeholder: Placeholder,
  selected: number,
  options: InstallerUiOptions,
): string => {
  const values = placeholder.enum ?? [];
  const navigation = glyph(options, "Use ↑/↓ and Enter, or press a number.", "Use Up/Down and Enter, or press a number.");
  const lines = [paint(`${placeholder.prompt} (${placeholder.key})`, "bold", options), paint(navigation, "dim", options)];
  values.forEach((value, index) => {
    const active = index === selected;
    const pointer = active ? glyph(options, "❯", ">") : " ";
    const state = active ? paint(value, "cyan", options) : value;
    lines.push(`${pointer} ${index + 1}. ${state}`);
  });
  return lines.join("\n");
};

const visible = (value: string, width: number): string => {
  if (value.length <= width) return value;
  return `${value.slice(0, Math.max(0, width - 1))}…`;
};

export const operationCounts = (operations: Operation[]): Record<string, number> => operations.reduce<Record<string, number>>((counts, operation) => {
  counts[operation.action] = (counts[operation.action] ?? 0) + 1;
  return counts;
}, {});

export const renderReview = (envelope: CreatorEnvelope, options: InstallerUiOptions): string => {
  const counts = operationCounts(envelope.operations);
  const changes = ["create", "update", "remove"].filter((action) => counts[action]).map((action) => `${counts[action]} ${action}`).join(", ") || "no changes";
  const lines = [
    paint("Review", "bold", options),
    `${paint("Target", "dim", options)}  ${envelope.target}`,
    `${paint("Changes", "dim", options)} ${changes}`,
  ];
  for (const operation of envelope.operations.filter((item) => item.action !== "noop").slice(0, 12)) {
    lines.push(`  ${operation.action.padEnd(7)} ${visible(operation.path, options.width - 12)}`);
  }
  const remaining = envelope.operations.filter((item) => item.action !== "noop").length - Math.min(12, envelope.operations.filter((item) => item.action !== "noop").length);
  if (remaining > 0) lines.push(paint(`  … and ${remaining} more`, "dim", options));
  if (envelope.diagnostics.length > 0) lines.push(paint(`${envelope.diagnostics.length} diagnostic(s) require attention.`, "yellow", options));
  return lines.join("\n");
};

export const renderDiagnostics = (diagnostics: Diagnostic[], options: InstallerUiOptions): string => diagnostics.map((item) => {
  const location = item.path ? ` (${item.path})` : "";
  return `${paint("!", "yellow", options)} ${item.code}: ${item.message}${location}`;
}).join("\n");

export const renderCompletion = (envelope: CreatorEnvelope, options: InstallerUiOptions): string => {
  const ready = ["planned", "dry-run", "applied", "noop", "verified", "healthy"].includes(envelope.status);
  const complete = ["applied", "noop", "verified", "healthy"].includes(envelope.status);
  const marker = ready ? glyph(options, "✔", "OK") : glyph(options, "✖", "FAIL");
  const headline = complete ? "Installation complete" : envelope.status === "cancelled" ? "Installation cancelled" : ready ? "Plan ready" : "Installation needs attention";
  const lines = [`${paint(marker, ready ? "green" : "red", options)} ${paint(headline, "bold", options)}`, `${paint("Status", "dim", options)}  ${envelope.status}`];
  if (envelope.rollback) lines.push(`${paint("Rollback", "dim", options)} ${envelope.rollback.message}`);
  if (complete) lines.push(paint("Next step: review the generated files before launching an agent.", "dim", options));
  return lines.join("\n");
};
