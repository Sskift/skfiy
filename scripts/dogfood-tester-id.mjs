export const RESERVED_DOGFOOD_TESTER_ID_PREFIXES = [
  "local-",
  "prepare-",
  "preflight-",
  "synthetic-"
];

export function assertRealDogfoodTesterId(testerId) {
  const decision = readRealTesterDecision(testerId, {
    missingMessage: "tester id is required"
  });

  if (!decision.ok) {
    throw new Error(
      decision.reservedPrefix
        ? `Reserved dogfood tester id prefix: ${decision.reservedPrefix}. Use a stable real tester id such as tester-1 or the tester's anonymized handle.`
        : decision.message
    );
  }
}

export function readRealTesterDecision(testerId, options = {}) {
  if (typeof testerId !== "string" || testerId.trim().length === 0) {
    return {
      ok: false,
      reservedPrefix: undefined,
      message: options.missingMessage ?? "missing tester id"
    };
  }

  const value = testerId.trim();
  const lowerValue = value.toLowerCase();
  const reservedPrefix = RESERVED_DOGFOOD_TESTER_ID_PREFIXES.find((prefix) =>
    lowerValue.startsWith(prefix)
  );

  if (reservedPrefix) {
    return {
      ok: false,
      reservedPrefix,
      message: `tester id ${value} is reserved for local synthetic runs`
    };
  }

  return {
    ok: true,
    reservedPrefix: undefined,
    message: "tester id counts as a real tester"
  };
}

export function isRealDogfoodTesterId(testerId) {
  return readRealTesterDecision(testerId).ok;
}

export function assertRealDogfoodReportTesterId(testerId) {
  const decision = readRealTesterDecision(testerId, {
    missingMessage: "report testerId is required for real tester counting"
  });

  if (!decision.ok) {
    throw new Error(decision.message);
  }
}

export function formatReservedDogfoodTesterIdPrefixes() {
  return RESERVED_DOGFOOD_TESTER_ID_PREFIXES.map((prefix) => `${prefix}*`).join(", ");
}
