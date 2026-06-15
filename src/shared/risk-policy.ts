import type { RiskDecision, RiskLevel } from "./types";

const LOW_RISK_COMMANDS = new Set(["pwd", "ls", "date", "whoami"]);

const HIGH_RISK_PATTERNS: RegExp[] = [
  /\brm\s+-[^\n;|&]*r/i,
  /\bsudo\b/i,
  /\bspctl\b/i,
  /\|\s*(sh|bash|zsh)\b/i,
  /\bosascript\b/i,
  /\bchmod\s+[-+]?R?\s*777\b/i,
  /\bchown\b/i,
  /\bmv\b.+\s+(\/System|\/Library|~\/Library)/i
];

const MEDIUM_RISK_PATTERNS: RegExp[] = [
  /\bmkdir\b/i,
  /\btouch\b/i,
  /\bcp\b/i,
  /\bmv\b/i,
  />{1,2}/
];

export function classifyTerminalCommand(command: string): RiskDecision {
  const normalized = command.trim();

  if (!normalized) {
    return decision("blocked", "Empty commands are not executable.", true);
  }

  if (HIGH_RISK_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return decision("high", "Command may modify security, credentials, or data destructively.", true);
  }

  const executable = normalized.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (LOW_RISK_COMMANDS.has(executable) && !/[;&|`$()<>]/.test(normalized)) {
    return decision("low", "Read-only terminal command.", false);
  }

  if (MEDIUM_RISK_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return decision("medium", "Command can create or modify local state.", true);
  }

  return decision("medium", "Unrecognized commands require approval in the MVP.", true);
}

function decision(level: RiskLevel, reason: string, requiresApproval: boolean): RiskDecision {
  return { level, reason, requiresApproval };
}
