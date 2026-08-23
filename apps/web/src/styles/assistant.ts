import { createGlobalStyle, css } from "antd-style";

export const AssistantGlobalStyles = createGlobalStyle(css`
/* AI assistant */
.sg-assistant {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
  align-items: start;
  width: 100%;
}
.sg-assistant-main {
  min-width: 0;
}
.sg-assistant-prompt {
  padding: 14px 16px 16px;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: #121116;
}
.sg-assistant-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 5px;
  color: #c6b1ff;
  background: #211a30;
  font-size: 12px;
}
.sg-assistant-input {
  width: 100%;
  border: 0;
  outline: 0;
  resize: vertical;
  color: var(--sg-fg);
  background: transparent;
  font-size: 15px;
  line-height: 1.6;
}
.sg-assistant-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  color: var(--sg-fg-2);
  background: #121116;
  font-size: 13px;
  cursor: pointer;
}
.sg-assistant-action:hover {
  border-color: #403852;
  color: #fff;
  background: #17151d;
}
.sg-assistant-suggestion {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  color: var(--sg-fg-2);
  background: #121116;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.sg-assistant-suggestion:hover {
  border-color: #403852;
  color: #fff;
}
.sg-assistant-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sg-assistant-task {
  padding: 11px 0;
  border-bottom: 1px solid var(--sg-border);
}
.sg-assistant-task:last-of-type {
  border-bottom: 0;
}
.sg-assistant-task strong {
  display: block;
  margin-bottom: 3px;
  font-size: 13px;
}

@media (max-width: 1050px) {
  :root,
  [data-theme="dark"] {
    --sg-sidebar-w: 68px;
  }
  .sg-sidebar-logo span:last-of-type,
  .sg-nav-item:not(.sg-nav-bottom) {
    font-size: 0;
  }
  .sg-sidebar-logo {
    justify-content: center;
  }
  .sg-nav-item {
    justify-content: center;
  }
  .sg-nav-icon {
    width: auto;
  }
  .sg-credits-box,
  .sg-nav-bottom,
  .sg-team-box span,
  .sg-team-box > svg {
    display: none;
  }
  .sg-team-box {
    justify-content: center;
    border-top: 0;
  }
  .sg-home-orbit {
    opacity: 0.45;
    right: 50px;
  }
  .sg-home-columns {
    grid-template-columns: 1fr;
  }
  .sg-assets-body {
    grid-template-columns: 1fr;
  }
  .sg-assets-side {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
  }
  .sg-side-card {
    min-width: 220px;
    flex: 1;
  }
  .sg-assistant {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  :root,
  [data-theme="dark"] {
    --sg-sidebar-w: 0px;
  }
  .sg-sidebar {
    display: none;
  }
  .sg-header {
    padding: 8px 12px;
  }
  .sg-breadcrumb {
    display: none;
  }
  .sg-search {
    order: 0;
    flex: 1;
    width: auto;
  }

  .sg-home-hero {
    min-height: 240px;
    padding: 30px 22px;
  }
  .sg-home-hero h1 {
    width: 100%;
    font-size: 28px;
  }
  .sg-hero-compose {
    width: 100%;
    margin-left: 0;
  }
  .sg-home-orbit {
    display: none;
  }
  .sg-quick-create {
    grid-template-columns: 1fr 1fr;
  }
  .sg-assets-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
  .sg-assets-search.ant-input-affix-wrapper {
    width: 100%;
  }
  .sg-assets-batch {
    margin-left: 0;
  }
}
`);
