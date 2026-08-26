import { createStyles } from "antd-style";
import type { PropsWithChildren } from "react";
import { useUiContentStyles } from "./styles/content.js";
import { useUiControlsStyles } from "./styles/controls.js";
import { useUiFoundationStyles } from "./styles/foundation.js";
import { useUiOverlaysStyles } from "./styles/overlays.js";
import { useUiUtilitiesStyles } from "./styles/utilities.js";
import { useUiVisualizationStyles } from "./styles/visualization.js";

const useUiStylesBoundary = createStyles(() => ({
  boundary: {
    display: "contents",
  },
}));

export function UiStylesBoundary({ children }: PropsWithChildren) {
  const { styles: boundary } = useUiStylesBoundary();
  const { styles: foundation } = useUiFoundationStyles();
  const { styles: controls } = useUiControlsStyles();
  const { styles: overlays } = useUiOverlaysStyles();
  const { styles: content } = useUiContentStyles();
  const { styles: visualization } = useUiVisualizationStyles();
  const { styles: utilities } = useUiUtilitiesStyles();
  return (
    <div
      className={[
        foundation.root,
        controls.root,
        overlays.root,
        content.root,
        visualization.root,
        utilities.root,
        boundary.boundary,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/** @deprecated Use UiStylesBoundary; kept for workspace consumers that still import the old name. */
export const UiGlobalStyles = UiStylesBoundary;
