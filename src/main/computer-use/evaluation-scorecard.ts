import type { PermissionSummary } from "./types.js";

export interface ComputerUseEvaluationEvent {
  status: string;
  message?: string;
}

export interface ComputerUseEvaluationRun {
  id: string;
  events: ComputerUseEvaluationEvent[];
  permissions?: PermissionSummary;
}

export interface ComputerUseScorecard {
  totalRuns: number;
  successfulRuns: number;
  taskSuccessRate: number;
  manualInterventions: number;
  averageSteps: number;
  unsafeActionBlocks: number;
  permissionFailures: number;
  desktopSessionBlocks: number;
  recoveryAttempts: number;
  actionVerificationFailures: number;
}

export function createComputerUseScorecard(
  runs: readonly ComputerUseEvaluationRun[]
): ComputerUseScorecard {
  const totalRuns = runs.length;
  const successfulRuns = runs.filter(isSuccessfulRun).length;
  const totalSteps = runs.reduce((sum, run) => sum + run.events.length, 0);

  return {
    totalRuns,
    successfulRuns,
    taskSuccessRate: totalRuns === 0 ? 0 : successfulRuns / totalRuns,
    manualInterventions: runs.filter(hasManualIntervention).length,
    averageSteps: totalRuns === 0 ? 0 : totalSteps / totalRuns,
    unsafeActionBlocks: runs.filter(hasUnsafeActionBlock).length,
    permissionFailures: runs.filter(hasPermissionFailure).length,
    desktopSessionBlocks: runs.filter(hasDesktopSessionBlock).length,
    recoveryAttempts: runs.filter(hasRecoveryAttempt).length,
    actionVerificationFailures: runs.filter(hasActionVerificationFailure).length
  };
}

function isSuccessfulRun(run: ComputerUseEvaluationRun): boolean {
  return run.events.some((event) => event.status === "completed");
}

function hasManualIntervention(run: ComputerUseEvaluationRun): boolean {
  return run.events.some((event) => (
    event.status === "approval_required" || event.status === "needs_confirmation"
  ));
}

function hasUnsafeActionBlock(run: ComputerUseEvaluationRun): boolean {
  return run.events.some((event) => event.status === "approval_required");
}

function hasPermissionFailure(run: ComputerUseEvaluationRun): boolean {
  if (run.events.some((event) => {
    const message = event.message?.toLowerCase() ?? "";
    return event.status === "failed" && message.includes("permission");
  })) {
    return true;
  }

  const permissions = run.permissions;
  return Boolean(
    permissions
    && (
      permissions.screenRecording.state === "denied"
      || permissions.accessibility.state === "denied"
    )
  );
}

function hasDesktopSessionBlock(run: ComputerUseEvaluationRun): boolean {
  return run.events.some((event) => {
    const message = event.message?.toLowerCase() ?? "";
    return (
      message.includes("desktop session")
      || message.includes("loginwindow")
      || message.includes("display is asleep")
    ) && (
      event.status === "failed"
      || event.status === "blocked"
    );
  });
}

function hasRecoveryAttempt(run: ComputerUseEvaluationRun): boolean {
  return run.events.some((event) => {
    const message = event.message?.toLowerCase() ?? "";
    return event.status === "recovering" || message.includes("recovery");
  });
}

function hasActionVerificationFailure(run: ComputerUseEvaluationRun): boolean {
  return run.events.some((event) => {
    const message = event.message?.toLowerCase() ?? "";
    return (
      event.status === "verification_failed"
      || message.includes("verification failed")
      || message.includes("needs user confirmation")
    );
  });
}
