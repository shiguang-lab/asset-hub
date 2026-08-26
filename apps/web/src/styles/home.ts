import { createStyles } from "antd-style";

export const useHomeStyles = createStyles(({ css }) => ({
  root: css`
/* Home content follows 10_28_25, translated into the dark shell. */
.sg-home {
  width: 100%;
  max-width: none;
  margin: 0;
}
.sg-home-hero {
  position: relative;
  overflow: hidden;
  min-height: 276px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 56px 44px;
  border: 1px solid #292444;
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgba(5, 7, 20, 0.08) 0%, rgba(5, 7, 20, 0.02) 54%, transparent 74%),
    url("/reference/home-hero-background-v3.webp") center / cover no-repeat,
    #080b1c;
  box-shadow: inset 0 0 48px rgba(40, 80, 174, 0.08);
}
.sg-home-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.34;
  background-image:
    linear-gradient(rgba(106, 143, 232, 0.09) 1px, transparent 1px),
    linear-gradient(90deg, rgba(106, 143, 232, 0.07) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(90deg, transparent, #000 64%, #000);
}
.sg-home-hero h1 {
  position: relative;
  z-index: 2;
  width: 70%;
  margin: 0 0 24px;
  color: #f6f8ff;
  font-size: 38px;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  text-shadow: 0 5px 22px rgba(86, 114, 255, 0.2);
}
.sg-hero-compose {
  position: relative;
  z-index: 2;
  width: min(704px, 62%);
  margin-left: 7%;
  min-height: 78px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 12px 11px 24px;
  border: 1px solid #3b3a54;
  border-radius: 10px;
  background: rgba(14, 14, 24, 0.88);
  box-shadow:
    0 16px 44px rgba(0, 0, 0, 0.3),
    0 0 24px rgba(83, 89, 231, 0.08);
  backdrop-filter: blur(14px);
}
.sg-hero-compose:focus-within {
  border-color: #7357e8;
  box-shadow: 0 0 0 3px rgba(124, 60, 255, 0.12);
}
.sg-hero-compose input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  color: var(--sg-fg);
  background: transparent;
  font-size: 14px;
}
.sg-hero-compose input::placeholder {
  color: #86849a;
}
.sg-hero-compose button {
  width: 44px;
  height: 44px;
  flex: none;
  display: grid;
  place-items: center;
  border: 1px solid #765cff;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(145deg, #815bff, #456ce8);
  box-shadow: 0 7px 22px rgba(91, 60, 240, 0.38);
  cursor: pointer;
}
.sg-quick-create {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 14px 0;
}
.sg-quick-item {
  min-width: 0;
  min-height: 96px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 14px;
  padding: 15px 16px;
  border: 1px solid #292732;
  border-radius: 8px;
  color: var(--sg-fg);
  background: #121116;
  text-align: left;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.12);
  cursor: pointer;
}
.sg-quick-item:hover {
  border-color: #44405a;
  background: #17151d;
}
.sg-quick-item .icon {
  width: 58px;
  height: 58px;
  flex: none;
  display: grid;
  place-items: center;
  border: 1px solid #2469b8;
  border-radius: 10px;
  color: #93d2ff;
  background: linear-gradient(145deg, #1e87e6, #2154dc);
  box-shadow: 0 0 18px rgba(40, 137, 255, 0.24);
}
.sg-quick-item .icon.green {
  color: #c4ffeb;
  border-color: #159a77;
  background: linear-gradient(145deg, #37d2aa, #079a75);
  box-shadow: 0 0 18px rgba(38, 203, 155, 0.2);
}
.sg-quick-item .icon.violet {
  color: #e1dbff;
  border-color: #705ddd;
  background: linear-gradient(145deg, #8b78ff, #5a45d6);
  box-shadow: 0 0 18px rgba(124, 96, 255, 0.22);
}
.sg-quick-item .icon.cyan {
  color: #d8f5ff;
  border-color: #328ac3;
  background: linear-gradient(145deg, #52bcec, #2471dd);
  box-shadow: 0 0 18px rgba(62, 158, 233, 0.22);
}
.sg-quick-copy {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
}
.sg-quick-copy strong {
  font-size: 15px;
}
.sg-quick-copy small {
  overflow: hidden;
  margin-top: 3px;
  color: var(--sg-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-quick-item .arrow {
  flex: none;
  color: #8e8b9e;
}
.sg-home-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: stretch;
}
.sg-home-panel {
  min-width: 0;
  min-height: 436px;
  overflow: hidden;
  border: 1px solid #292732;
  border-radius: 8px;
  background: #121116;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.12);
}
.sg-section-head {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}
.sg-section-head h2 {
  margin: 0;
  font-size: 15px;
}
.sg-section-head button {
  border: 0;
  color: #858196;
  background: transparent;
  letter-spacing: 2px;
  cursor: pointer;
}
.sg-running-body {
  padding: 0 16px 16px;
}
.sg-running-card,
.sg-running-empty,
.sg-recent-empty {
  width: 100%;
  min-height: 105px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1px solid #2d2a39;
  border-radius: 8px;
  color: var(--sg-fg);
  background: #17151c;
  text-align: left;
  cursor: pointer;
}
.sg-running-card:hover,
.sg-running-empty:hover,
.sg-recent-empty:hover {
  border-color: #463c66;
  background: #1b1822;
}
.sg-running-icon {
  width: 50px;
  height: 50px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: #77a9ff;
  background: #202b49;
}
.sg-running-info {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
}
.sg-running-info strong {
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-progress-line {
  height: 5px;
  overflow: hidden;
  margin: 10px 0 7px;
  border-radius: 3px;
  background: #292734;
}
.sg-progress-line i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #367cff, #744cff);
}
.sg-running-card small,
.sg-running-empty small {
  display: block;
  margin-top: 3px;
  color: var(--sg-muted);
  font-size: 11px;
}
.sg-running-progress {
  width: 92px;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.sg-running-progress b {
  color: #9f8aff;
  font-size: 14px;
}
.sg-running-progress small {
  color: #866dff;
  white-space: nowrap;
}
.sg-running-empty > span:nth-of-type(2) {
  flex: 1;
}
.sg-template-section {
  padding: 16px;
  border-top: 1px solid #27242e;
}
.sg-template-section h3 {
  margin: 0 0 13px;
  font-size: 14px;
}
.sg-template-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.sg-template-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #2d2a38;
  border-radius: 7px;
  background: #17151c;
}
.sg-template-card > img {
  width: 100%;
  height: 100px;
  display: block;
  object-fit: cover;
  opacity: 0.84;
  filter: brightness(0.76) saturate(0.92);
}
.sg-template-card > div {
  padding: 10px;
}
.sg-template-card strong,
.sg-template-card small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-template-card strong {
  font-size: 12.5px;
}
.sg-template-card small {
  margin: 3px 0 9px;
  color: var(--sg-muted);
  font-size: 10px;
}
.sg-team-box > .ant-avatar {
  flex: none;
  display: inline-flex;
  flex-direction: row;
  border-radius: 50%;
}
.sg-template-card button {
  width: 100%;
  height: 28px;
  border: 1px solid #6048bb;
  border-radius: 5px;
  color: #a990ff;
  background: transparent;
  font-size: 11px;
  cursor: pointer;
}
.sg-template-card button:hover {
  color: #fff;
  background: #6840d5;
}
.sg-recent-panel {
  position: relative;
  padding-bottom: 50px;
}
.sg-recent-content {
  padding: 0 18px;
}
.sg-recent-table {
  width: 100%;
}
.sg-home-recent-name {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}
.sg-home-recent-name strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-home-recent-row {
  cursor: pointer;
}
.sg-file-icon {
  width: 29px;
  height: 29px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 5px;
  color: #dcecff;
  background: #336ddd;
}
.sg-file-icon.presentation {
  background: #db7b2d;
}
.sg-file-icon.pdf {
  background: #d84d59;
}
.sg-file-icon.knowledge {
  background: #5d48dc;
}
.sg-recent-empty {
  min-height: 110px;
}
.sg-recent-empty span {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.sg-recent-empty small {
  color: var(--sg-muted);
}
.sg-view-all {
  position: absolute;
  right: 20px;
  bottom: 15px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 0;
  color: #9e9aae;
  background: transparent;
  cursor: pointer;
}
.sg-view-all:hover {
  color: #a990ff;
}

@media (max-width: 760px) {
  .sg-home-hero {
    min-height: 236px;
    padding: 28px 20px;
  }
  .sg-home-hero h1 {
    width: 100%;
    margin-bottom: 18px;
    font-size: 28px;
  }
  .sg-hero-compose {
    width: 100%;
    margin-left: 0;
    min-height: 64px;
    padding-left: 14px;
  }
  .sg-quick-create {
    gap: 10px;
  }
  .sg-quick-item {
    min-height: 84px;
    gap: 8px;
    padding: 12px;
  }
  .sg-quick-item .icon {
    width: 44px;
    height: 44px;
  }
  .sg-quick-item .icon svg {
    width: 24px;
    height: 24px;
  }
  .sg-quick-item .arrow {
    width: 14px;
    height: 14px;
  }
  .sg-quick-copy strong {
    overflow: hidden;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sg-quick-copy small {
    font-size: 10px;
  }
  .sg-home-columns {
    grid-template-columns: 1fr;
  }
  .sg-home-panel {
    min-height: 0;
  }
}
  `,
}));
