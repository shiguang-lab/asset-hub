import { UiContentGlobalStyles } from "./styles/content.js";
import { UiControlsGlobalStyles } from "./styles/controls.js";
import { UiFoundationGlobalStyles } from "./styles/foundation.js";
import { UiOverlaysGlobalStyles } from "./styles/overlays.js";
import { UiUtilitiesGlobalStyles } from "./styles/utilities.js";
import { UiVisualizationGlobalStyles } from "./styles/visualization.js";

export function UiGlobalStyles() {
  return (
    <>
      <UiFoundationGlobalStyles />
      <UiControlsGlobalStyles />
      <UiOverlaysGlobalStyles />
      <UiContentGlobalStyles />
      <UiVisualizationGlobalStyles />
      <UiUtilitiesGlobalStyles />
    </>
  );
}
