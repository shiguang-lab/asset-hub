import { createGlobalStyle, css } from "antd-style";

export const UiContentGlobalStyles = createGlobalStyle(css`
/* ---------------- markdown preview ---------------- */
.sg-md {
  line-height: 1.75;
  font-size: 15px;
}
.sg-md h1,
.sg-md h2,
.sg-md h3 {
  line-height: 1.3;
  margin: 1.2em 0 0.5em;
}
.sg-md h1 {
  font-size: 1.7em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--sg-border);
}
.sg-md h2 {
  font-size: 1.35em;
}
.sg-md code {
  background: var(--sg-accent-soft);
  color: var(--sg-accent);
  border-radius: 4px;
  padding: 0.15em 0.35em;
  font-size: 0.9em;
}
.sg-md pre {
  background: #101625;
  color: #e6e9f2;
  padding: 14px;
  border-radius: 10px;
  overflow: auto;
}
.sg-md pre code {
  background: transparent;
  color: inherit;
  padding: 0;
}
.sg-md table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}
.sg-md th,
.sg-md td {
  border: 1px solid var(--sg-border);
  padding: 7px 11px;
}
.sg-md blockquote {
  border-left: 4px solid var(--sg-accent);
  margin: 1em 0;
  padding: 0.3em 1em;
  color: var(--sg-muted);
  background: var(--sg-accent-soft);
}
.sg-md img {
  max-width: 100%;
}
.sg-md a {
  color: var(--sg-accent);
}

/* ---------------- editor chrome ---------------- */
.sg-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--sg-border);
  border-bottom: 0;
  border-radius: 10px 10px 0 0;
  background: var(--sg-bg-2);
  flex-wrap: wrap;
}
.sg-editor-toolbar .mode {
  margin-left: auto;
  flex: none;
  display: flex;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  overflow: hidden;
}
.sg-editor-toolbar .mode button {
  border: 0;
  background: transparent;
  color: var(--sg-muted);
  padding: 5px 12px;
  font-size: 12.5px;
  cursor: pointer;
}
.sg-editor-toolbar .mode button.active {
  background: var(--sg-accent-soft);
  color: var(--sg-accent);
  font-weight: 600;
}
.sg-editor {
  border: 1px solid var(--sg-border);
  border-radius: 0 0 10px 10px;
  overflow: hidden;
  background: var(--sg-bg-2);
}
.sg-editor .cm-editor {
  height: 100%;
  min-height: 480px;
  font-size: 13.5px;
}
.sg-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.sg-preview {
  padding: 20px 28px;
  overflow: auto;
  border-left: 1px solid var(--sg-border);
  min-height: 480px;
}

/* ---------------- home ---------------- */
.sg-hero-input {
  width: 100%;
  padding: 16px 20px;
  font-size: 15.5px;
  border: 1px solid var(--sg-border);
  border-radius: 12px;
  background: var(--sg-bg-2);
  color: var(--sg-fg);
  outline: none;
  box-shadow: var(--sg-shadow);
}
.sg-hero-input:focus {
  border-color: var(--sg-accent);
  box-shadow: 0 0 0 4px var(--sg-accent-soft);
}
.sg-quick-create {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
@media (max-width: 1100px) {
  .sg-quick-create {
    grid-template-columns: repeat(2, 1fr);
  }
}
.sg-quick-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: flex-start;
  padding: 16px;
  border: 1px solid var(--sg-border);
  border-radius: 12px;
  background: var(--sg-bg-2);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  font-family: var(--sg-font);
}
.sg-quick-item:hover {
  border-color: var(--sg-accent);
  background: var(--sg-accent-soft);
}
.sg-quick-item .icon {
  font-size: 22px;
}
.sg-quick-item .sub {
  font-size: 12.5px;
  color: var(--sg-muted);
}

/* ---------------- wizard stepper ---------------- */
.sg-stepper {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.sg-step {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--sg-muted);
  background: var(--sg-bg-3);
}
.sg-step .num {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  font-weight: 700;
  background: var(--sg-bg-2);
  color: var(--sg-muted);
  border: 1px solid var(--sg-border);
}
.sg-step.active {
  background: var(--sg-accent-soft);
  color: var(--sg-accent);
  font-weight: 600;
}
.sg-step.active .num {
  background: var(--sg-accent);
  color: #fff;
  border-color: var(--sg-accent);
}
.sg-step.done .num {
  background: var(--sg-success);
  color: #fff;
  border-color: var(--sg-success);
}
`);
