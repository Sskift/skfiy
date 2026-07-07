export interface PanelState {
  assistantPanelOpen: boolean;
  detailsOpen: boolean;
  permissionOnboardingOpen: boolean;
}

export type PanelStateAction =
  | { type: "assistant-reply" }
  | { type: "non-idle-task-event" }
  | { type: "open-assistant" }
  | { type: "toggle-assistant" }
  | { type: "toggle-details" }
  | { type: "close-for-drag" }
  | { type: "close-details" }
  | { type: "close-permission-onboarding" };

export const INITIAL_PANEL_STATE: PanelState = {
  assistantPanelOpen: false,
  detailsOpen: false,
  permissionOnboardingOpen: false
};

export function reducePanelState(
  state: PanelState,
  action: PanelStateAction
): PanelState {
  switch (action.type) {
    case "assistant-reply":
    case "open-assistant":
      return {
        assistantPanelOpen: true,
        detailsOpen: false,
        permissionOnboardingOpen: false
      };
    case "non-idle-task-event":
      return {
        ...state,
        assistantPanelOpen: false,
        detailsOpen: false
      };
    case "toggle-assistant":
      return {
        assistantPanelOpen: !state.assistantPanelOpen,
        detailsOpen: false,
        permissionOnboardingOpen: false
      };
    case "toggle-details":
      return {
        assistantPanelOpen: false,
        detailsOpen: !state.detailsOpen,
        permissionOnboardingOpen: false
      };
    case "close-for-drag":
      return INITIAL_PANEL_STATE;
    case "close-details":
      return {
        ...state,
        detailsOpen: false
      };
    case "close-permission-onboarding":
      return {
        ...state,
        permissionOnboardingOpen: false
      };
  }
}
