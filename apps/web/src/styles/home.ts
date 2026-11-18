import { createStyles } from "antd-style";

export const useHomeStyles = createStyles(({ css }) => ({
  root: css`
/* V6 Home: Borderless Conversational Hub + Open Editorial Galleries */
.zx-home-studio {
  flex: 1;
  width: 100%;
  padding: 46px 56px 38px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}

.zx-hero-open {
  width: 100%;
  max-width: 860px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.zx-hero-open h1 {
  margin: 0 0 22px;
  font-size: 36px;
  font-weight: 770;
  letter-spacing: -0.03em;
  color: var(--sg-fg);
}

.zx-omni-rim {
  width: 100%;
  max-width: 760px;
  padding: 1.5px;
  border-radius: 22px;
  background: var(--zx-omni-rim);
  box-shadow: var(--zx-omni-shadow);
}
.zx-omni-inner {
  height: 68px;
  padding: 0 12px 0 24px;
  border-radius: 20.5px;
  background: var(--zx-omni-bg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  backdrop-filter: blur(24px);
}
.zx-omni-inner input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--sg-fg);
  font-size: 15px;
}
.zx-omni-inner input::placeholder {
  color: var(--sg-muted);
}
.zx-omni-send {
  width: 46px;
  height: 46px;
  border-radius: 999px;
  border: 0;
  background: var(--zx-cta-bg);
  box-shadow: var(--zx-cta-shadow);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 140ms ease;
}
.zx-omni-send:hover {
  transform: scale(1.04);
}

/* 4 Centered Tactile Studio Mode Pills */
.zx-mode-cluster {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
  max-width: 840px;
}
.zx-mode-pill {
  height: 62px;
  padding: 0 14px;
  border-radius: 16px;
  background: var(--zx-surface-card);
  border: 1px solid var(--zx-border);
  box-shadow: var(--zx-card-shadow);
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  cursor: pointer;
  color: var(--sg-fg);
  transition: transform 150ms ease, border-color 150ms ease;
}
.zx-mode-pill:nth-child(1) {
  background: linear-gradient(145deg, rgba(14, 165, 233, 0.16) 0%, rgba(20, 24, 42, 0.84) 72%);
  border-color: rgba(56, 189, 248, 0.24);
}
.zx-mode-pill:nth-child(2) {
  background: linear-gradient(145deg, rgba(16, 185, 129, 0.16) 0%, rgba(20, 24, 42, 0.84) 72%);
  border-color: rgba(52, 211, 153, 0.24);
}
.zx-mode-pill:nth-child(3) {
  background: linear-gradient(
    145deg,
    rgba(244, 114, 182, 0.18) 0%,
    rgba(139, 92, 246, 0.14) 40%,
    rgba(20, 24, 42, 0.84) 76%
  );
  border-color: rgba(244, 114, 182, 0.26);
}
.zx-mode-pill:nth-child(4) {
  background: linear-gradient(145deg, rgba(99, 102, 241, 0.18) 0%, rgba(20, 24, 42, 0.84) 72%);
  border-color: rgba(129, 140, 248, 0.26);
}
.zx-mode-pill:hover {
  transform: translateY(-2px);
  border-color: var(--zx-brand-border);
}
.zx-mode-txt {
  min-width: 0;
  flex: 1;
}
.zx-mode-txt strong {
  display: block;
  font-size: 14px;
  font-weight: 680;
  color: var(--sg-fg);
}
.zx-mode-txt small {
  display: block;
  font-size: 12px;
  color: var(--sg-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Dynamic Island Live Task Capsule */
.zx-live-island {
  margin-top: 16px;
  width: 100%;
  max-width: 840px;
  min-height: 46px;
  padding: 6px 18px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgba(168, 85, 247, 0.20) 0%,
    rgba(56, 189, 248, 0.12) 55%,
    rgba(20, 24, 42, 0.85) 100%
  );
  border: 1px solid rgba(192, 132, 252, 0.34);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  font-size: 12.5px;
  color: var(--sg-fg);
  cursor: pointer;
  text-align: left;
  transition: border-color 150ms ease, transform 150ms ease;
}
.zx-live-island:hover {
  border-color: rgba(192, 132, 252, 0.56);
  transform: translateY(-1px);
}
.zx-pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  background: #A855F7;
  box-shadow: 0 0 0 4px rgba(168, 85, 247, 0.22);
  flex-shrink: 0;
}
.zx-island-bar {
  width: 132px;
  height: 5px;
  border-radius: 99px;
  background: var(--zx-border);
  overflow: hidden;
}
.zx-island-bar i {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: var(--zx-prog-grad);
}

/* Open Editorial Galleries */
.zx-showcase-wrap {
  width: 100%;
  max-width: 1140px;
  margin-top: 32px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.zx-sec-bar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 13px;
}
.zx-sec-bar h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 730;
  letter-spacing: -0.015em;
  color: var(--sg-fg);
}
.zx-sec-bar h2 span {
  font-size: 12.5px;
  font-weight: 480;
  color: var(--sg-muted);
  margin-left: 8px;
}
.zx-sec-more {
  border: 0;
  background: transparent;
  font-size: 12.5px;
  font-weight: 620;
  color: var(--zx-brand);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.zx-sec-more:hover {
  color: #E9D5FF;
}

.zx-rec-gallery {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
}
.zx-work-card {
  border-radius: 18px;
  background: var(--zx-surface-card);
  border: 1px solid var(--zx-border);
  box-shadow: var(--zx-card-shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  text-align: left;
  padding: 0;
  color: inherit;
  transition: transform 160ms ease, border-color 160ms ease;
}
.zx-work-card:hover {
  transform: translateY(-3px);
  border-color: var(--zx-brand-border);
}
.zx-work-thumb {
  height: 118px;
  width: 100%;
  border-bottom: 1px solid var(--zx-border);
  overflow: hidden;
}
.zx-work-meta {
  padding: 13px 15px 14px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
}
.zx-work-title {
  font-size: 13.5px;
  font-weight: 680;
  color: var(--sg-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.zx-work-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--sg-muted);
}

.zx-home-empty-card {
  width: 100%;
  min-height: 112px;
  padding: 20px 24px;
  border-radius: 18px;
  background: var(--zx-surface-card);
  border: 1px dashed var(--zx-border-strong);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: var(--sg-fg);
  cursor: pointer;
  text-align: left;
}
.zx-home-empty-card:hover {
  border-color: var(--zx-brand-border);
}

/* Row 2: 3 Wide Panoramic Template Cards */
.zx-tpl-gallery {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}
.zx-pano-tpl {
  border-radius: 18px;
  background: var(--zx-surface-card);
  border: 1px solid var(--zx-border);
  box-shadow: var(--zx-card-shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease;
}
.zx-pano-tpl:hover {
  transform: translateY(-3px);
  border-color: var(--zx-brand-border);
}
.zx-pano-art {
  height: 114px;
  border-bottom: 1px solid var(--zx-border);
  overflow: hidden;
}
.zx-pano-foot {
  padding: 13px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.zx-pano-copy {
  min-width: 0;
  flex: 1;
}
.zx-pano-copy strong {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: var(--sg-fg);
}
.zx-pano-copy small {
  display: block;
  font-size: 12px;
  color: var(--sg-muted);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.zx-pano-btn {
  height: 32px;
  padding: 0 13px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.zx-pano-btn.b0 {
  background: rgba(56, 189, 248, 0.16);
  color: #7DD3FC;
  border: 1px solid rgba(56, 189, 248, 0.35);
}
.zx-pano-btn.b1 {
  background: rgba(52, 211, 153, 0.16);
  color: #6EE7B7;
  border: 1px solid rgba(52, 211, 153, 0.35);
}
.zx-pano-btn.b2 {
  background: rgba(192, 132, 252, 0.18);
  color: #E9D5FF;
  border: 1px solid rgba(192, 132, 252, 0.38);
}

@media (max-width: 1280px) {
  .zx-home-studio {
    padding: 36px 28px 28px;
  }
  .zx-rec-gallery {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 820px) {
  .zx-mode-cluster {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .zx-rec-gallery,
  .zx-tpl-gallery {
    grid-template-columns: 1fr;
  }
}
  `,
}));
