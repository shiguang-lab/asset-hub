import { createGlobalStyle } from "antd-style";

/**
 * The document roots sit outside the scoped app style boundary, so this is the
 * only intentionally global reset in the web app. Business component styles
 * remain scoped through antd-style's createStyles.
 */
export const AppDocumentReset = createGlobalStyle`
  html,
  body,
  #root {
    height: 100%;
    margin: 0;
    background: #060811;
    color: #F6F7FB;
    -webkit-font-smoothing: antialiased;
    font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  }
`;
