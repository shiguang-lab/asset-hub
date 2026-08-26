import { createStyles } from "antd-style";

export const useBreadcrumbStyles = createStyles(({ css }) => ({
  root: css`
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
    display: none !important;
  }
  .sg-header-tools {
    min-width: 0;
    width: auto;
    flex: 1 1 auto;
    gap: 6px;
  }
  .sg-header-tools .sg-search {
    min-width: 0;
    width: auto;
    flex: 1;
  }
  .sg-header-actions {
    gap: 2px !important;
  }
  .sg-create-button.ant-btn {
    width: 72px;
    min-width: 72px;
    padding-inline: 7px;
  }
  .sg-create-button.is-context {
    width: auto;
    min-width: 0;
    max-width: 99px;
    padding-inline: 6px;
  }
  .sg-create-button.is-context > span:last-child {
    max-width: 62px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sg-space-switcher.ant-btn {
    max-width: 72px;
    gap: 4px;
    padding-inline: 4px;
  }
}
  `,
}));
