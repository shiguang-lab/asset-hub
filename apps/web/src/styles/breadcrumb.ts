import { createGlobalStyle, css } from "antd-style";

export const BreadcrumbGlobalStyles = createGlobalStyle(css`
/* Header breadcrumb rule: every route keeps its location at the left edge. */
.sg-header .sg-breadcrumb {
  display: flex !important;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  gap: 7px;
  overflow: hidden;
  color: var(--sg-muted);
  font-size: 14px;
  white-space: nowrap;
}
.sg-breadcrumb-section,
.sg-breadcrumb-current {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-breadcrumb-section {
  color: #9c98aa;
}
.sg-breadcrumb-current {
  color: var(--sg-fg);
  font-weight: 650;
}
.sg-breadcrumb-separator {
  flex: none;
  color: #777489;
}
.sg-create-button.is-context {
  width: auto;
  min-width: 104px;
  white-space: nowrap;
}
@media (max-width: 760px) {
  .sg-header {
    gap: 8px;
    padding-inline: 12px !important;
  }
  .sg-header .sg-breadcrumb {
    flex: 0 1 96px;
    font-size: 13px;
  }
  .sg-header-tools {
    min-width: 0;
    width: auto;
    flex: 1 1 auto;
    gap: 6px;
  }
  .sg-header-tools .sg-search {
    min-width: 0;
  }
  .sg-header-actions {
    gap: 4px !important;
  }
  .sg-create-button.ant-btn {
    width: 72px;
    min-width: 72px;
    padding-inline: 7px;
  }
  .sg-create-button.is-context {
    width: auto;
    min-width: 104px;
    padding-inline: 8px;
  }
}
`);
