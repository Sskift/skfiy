import { describe, expect, it } from "vitest";

import {
  INITIAL_PANEL_STATE,
  reducePanelState,
  type PanelState
} from "./app-panel-state";

const openEverything: PanelState = {
  assistantPanelOpen: true,
  detailsOpen: true,
  permissionOnboardingOpen: true
};

describe("app panel state", () => {
  it("starts with every panel closed", () => {
    expect(INITIAL_PANEL_STATE).toEqual({
      assistantPanelOpen: false,
      detailsOpen: false,
      permissionOnboardingOpen: false
    });
  });

  it("opens the assistant panel for assistant replies and user entry", () => {
    expect(reducePanelState(openEverything, { type: "assistant-reply" })).toEqual({
      assistantPanelOpen: true,
      detailsOpen: false,
      permissionOnboardingOpen: false
    });
    expect(reducePanelState(INITIAL_PANEL_STATE, { type: "open-assistant" })).toEqual({
      assistantPanelOpen: true,
      detailsOpen: false,
      permissionOnboardingOpen: false
    });
  });

  it("keeps permission onboarding state when task events close task panels", () => {
    expect(reducePanelState(openEverything, { type: "non-idle-task-event" })).toEqual({
      assistantPanelOpen: false,
      detailsOpen: false,
      permissionOnboardingOpen: true
    });
  });

  it("toggles assistant and details as mutually exclusive pet panels", () => {
    expect(reducePanelState(INITIAL_PANEL_STATE, { type: "toggle-assistant" })).toEqual({
      assistantPanelOpen: true,
      detailsOpen: false,
      permissionOnboardingOpen: false
    });
    expect(reducePanelState({
      assistantPanelOpen: true,
      detailsOpen: false,
      permissionOnboardingOpen: false
    }, { type: "toggle-assistant" })).toEqual(INITIAL_PANEL_STATE);
    expect(reducePanelState(openEverything, { type: "toggle-details" })).toEqual({
      assistantPanelOpen: false,
      detailsOpen: false,
      permissionOnboardingOpen: false
    });
    expect(reducePanelState(INITIAL_PANEL_STATE, { type: "toggle-details" })).toEqual({
      assistantPanelOpen: false,
      detailsOpen: true,
      permissionOnboardingOpen: false
    });
  });

  it("closes the appropriate panel scopes", () => {
    expect(reducePanelState(openEverything, { type: "close-for-drag" })).toEqual(INITIAL_PANEL_STATE);
    expect(reducePanelState(openEverything, { type: "close-details" })).toEqual({
      assistantPanelOpen: true,
      detailsOpen: false,
      permissionOnboardingOpen: true
    });
    expect(reducePanelState(openEverything, { type: "close-permission-onboarding" })).toEqual({
      assistantPanelOpen: true,
      detailsOpen: true,
      permissionOnboardingOpen: false
    });
  });
});
