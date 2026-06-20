const MESSAGE_SCHEMA_VERSION = 1;

const MESSAGE_TYPES = Object.freeze({
  PAGE_OBSERVE: "skfiy.page.observe",
  PAGE_OBSERVE_RESULT: "skfiy.page.observe_result",
  PAGE_ACTION: "skfiy.page.action",
  PAGE_ACTION_RESULT: "skfiy.page.action_result",
  PAGE_SENSITIVE_PAUSE: "skfiy.page.sensitive_pause"
});

const SENSITIVE_FIELD_PATTERNS = [
  /password/i,
  /passcode/i,
  /otp/i,
  /two[-_\s]?factor/i,
  /credit[-_\s]?card/i,
  /card[-_\s]?number/i,
  /security[-_\s]?code/i,
  /\bcvv\b/i,
  /token/i,
  /secret/i,
  /api[-_\s]?key/i
];

function textOf(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isVisible(element) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
}

function boundsFor(element) {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function accessibleNameFor(element) {
  return (
    textOf(element.getAttribute("aria-label")) ||
    textOf(element.getAttribute("title")) ||
    textOf(element.innerText) ||
    textOf(element.getAttribute("name")) ||
    textOf(element.getAttribute("id"))
  );
}

function roleFor(element) {
  return textOf(element.getAttribute("role")) || element.tagName.toLowerCase();
}

function collectFormMetadata() {
  return Array.from(document.querySelectorAll("input, textarea, select, button"))
    .filter(isVisible)
    .slice(0, 200)
    .map((element, index) => ({
      id: `form-${index}`,
      tag: element.tagName.toLowerCase(),
      type: textOf(element.getAttribute("type")),
      name: textOf(element.getAttribute("name")),
      label: accessibleNameFor(element),
      role: roleFor(element),
      selector: selectorFor(element),
      bounds: boundsFor(element),
      sensitive: looksSensitive(element)
    }));
}

function collectInteractiveElements() {
  return Array.from(
    document.querySelectorAll("a, button, input, textarea, select, [role], [tabindex]")
  )
    .filter(isVisible)
    .slice(0, 300)
    .map((element, index) => ({
      id: `element-${index}`,
      role: roleFor(element),
      label: accessibleNameFor(element),
      selector: selectorFor(element),
      bounds: boundsFor(element)
    }));
}

function selectorFor(element) {
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }
  const name = element.getAttribute("name");
  if (name) {
    return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  }
  return element.tagName.toLowerCase();
}

function capturePageSnapshot() {
  return {
    schemaVersion: MESSAGE_SCHEMA_VERSION,
    url: location.href,
    host: location.host,
    title: document.title,
    visibleText: textOf(document.body?.innerText).slice(0, 20000),
    forms: collectFormMetadata(),
    interactiveElements: collectInteractiveElements()
  };
}

function looksSensitive(element, value = "") {
  const haystack = [
    element.getAttribute("type"),
    element.getAttribute("name"),
    element.getAttribute("id"),
    element.getAttribute("autocomplete"),
    element.getAttribute("aria-label"),
    element.getAttribute("placeholder"),
    value
  ]
    .map(textOf)
    .join(" ");

  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(haystack));
}

function markSensitivePause(reason, action) {
  document.documentElement.setAttribute("data-skfiy-sensitive-paused", reason);
  void chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.PAGE_SENSITIVE_PAUSE,
    schemaVersion: MESSAGE_SCHEMA_VERSION,
    url: location.href,
    host: location.host,
    reason,
    actionType: action?.kind ?? action?.type ?? "unknown"
  });
  return {
    type: MESSAGE_TYPES.PAGE_ACTION_RESULT,
    schemaVersion: MESSAGE_SCHEMA_VERSION,
    result: "sensitive-paused",
    reason
  };
}

function elementByText(text) {
  const wanted = textOf(text).toLowerCase();
  if (!wanted) {
    return null;
  }

  return Array.from(document.querySelectorAll("a, button, input, textarea, select, [role], [tabindex]"))
    .filter(isVisible)
    .find((element) => accessibleNameFor(element).toLowerCase().includes(wanted)) ?? null;
}

function elementByRole(role, name = "") {
  const wantedRole = textOf(role).toLowerCase();
  const wantedName = textOf(name).toLowerCase();
  if (!wantedRole) {
    return null;
  }

  return Array.from(document.querySelectorAll("a, button, input, textarea, select, [role], [tabindex]"))
    .filter(isVisible)
    .find((element) => {
      const roleMatches = roleFor(element).toLowerCase() === wantedRole;
      const nameMatches = !wantedName || accessibleNameFor(element).toLowerCase().includes(wantedName);
      return roleMatches && nameMatches;
    }) ?? null;
}

function elementForAction(action) {
  if (action.selector) {
    return document.querySelector(action.selector);
  }
  if (action.text) {
    return elementByText(action.text);
  }
  if (action.role) {
    return elementByRole(action.role, action.name);
  }
  return null;
}

function runPageAction(action) {
  if (action.kind === "navigate" && action.url) {
    location.assign(action.url);
    return { result: "started", action: "navigate" };
  }

  const element = elementForAction(action);

  if ((action.kind === "fill" || action.kind === "click") && element && looksSensitive(element, action.value)) {
    return markSensitivePause("Sensitive content pause", action);
  }

  if (action.kind === "focus" && element) {
    element.focus();
    return { result: "passed", action: "focus" };
  }

  if (action.kind === "fill" && element) {
    element.focus();
    element.value = action.value ?? "";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return { result: "passed", action: "fill" };
  }

  if (action.kind === "click" && element) {
    element.click();
    return { result: "passed", action: "click" };
  }

  if (action.kind === "submit" && element && action.confirmed === true) {
    const form = element.matches?.("form") ? element : element.closest?.("form");
    if (form?.requestSubmit) {
      form.requestSubmit();
    } else if (form?.submit) {
      form.submit();
    } else {
      element.click();
    }
    return { result: "passed", action: "submit" };
  }

  if (action.kind === "scroll") {
    window.scrollBy({ top: action.deltaY ?? 0, left: action.deltaX ?? 0, behavior: "auto" });
    return { result: "passed", action: "scroll" };
  }

  return { result: "blocked", reason: "unsupported_or_missing_target" };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.PAGE_OBSERVE) {
    sendResponse({
      type: MESSAGE_TYPES.PAGE_OBSERVE_RESULT,
      requestId: message.requestId,
      snapshot: capturePageSnapshot()
    });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.PAGE_ACTION) {
    sendResponse({
      type: MESSAGE_TYPES.PAGE_ACTION_RESULT,
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      requestId: message.requestId,
      ...runPageAction(message.action ?? message)
    });
    return true;
  }

  return false;
});
