/*
 * Shared presentation player chrome.
 *
 * This file intentionally has no framework/runtime dependency. Vite copies it
 * from public/ to the web origin, while public-gateway and embedded srcDoc
 * pages load the same asset. The generated presentation runtime remains the
 * source of truth for page rendering; this file owns the player controls and
 * synchronises them with SG.presentation().
 */
(function () {
  "use strict";

  var MARKER = "data-sg-presentation-player";
  var rootMarker = "data-sg-public-player-root";
  var script = document.currentScript;
  var uiEnabled = !(script && script.getAttribute("data-sg-player-ui") === "false");
  var pages = [];
  var current = 0;
  var controller = null;
  var drawer = null;
  var progressFill = null;
  var pageLabel = null;
  var prevButton = null;
  var nextButton = null;
  var directoryButton = null;

  function cssText() {
    return [
      '[data-sg-public-player-root]{position:fixed;z-index:2147483000;left:0;right:0;bottom:0;pointer-events:none;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#d9e2e5}',
      '[data-sg-public-player-root] *{box-sizing:border-box}',
      '[data-sg-public-player-progress]{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(90,110,112,.25);pointer-events:auto;cursor:pointer}',
      '[data-sg-public-player-progress-fill]{display:block;height:100%;width:0;background:#63e6be;transition:width 180ms ease}',
      '[data-sg-public-player-dock]{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin:0 16px 16px auto;width:max-content;padding:7px 8px;border:1px solid rgba(114,140,143,.35);background:rgba(8,14,15,.88);backdrop-filter:blur(12px);pointer-events:auto}',
      '[data-sg-public-player-button]{width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(114,140,143,.45);background:rgba(13,23,24,.88);color:#cbd7d8;cursor:pointer;font:inherit}',
      '[data-sg-public-player-button]:hover{border-color:#63e6be;color:#63e6be}',
      '[data-sg-public-player-button][disabled]{opacity:.35;cursor:default}',
      '[data-sg-public-player-page]{min-width:66px;text-align:center;color:#a8b7ba;font-size:12px;letter-spacing:.08em}',
      '[data-sg-public-player-drawer]{position:absolute;right:16px;bottom:76px;width:min(390px,calc(100vw - 32px));max-height:min(72vh,620px);overflow:auto;padding:14px;background:rgba(7,16,16,.96);border:1px solid rgba(114,140,143,.42);box-shadow:0 20px 60px rgba(0,0,0,.45);pointer-events:auto}',
      '[data-sg-public-player-drawer][hidden]{display:none}',
      '[data-sg-public-player-drawer-head]{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-size:15px;font-weight:700}',
      '[data-sg-public-player-list]{display:grid;gap:8px}',
      '[data-sg-public-player-item]{display:flex;gap:10px;align-items:flex-start;width:100%;padding:10px 11px;border:1px solid rgba(114,140,143,.28);background:transparent;color:#afbec0;text-align:left;cursor:pointer;font:inherit}',
      '[data-sg-public-player-item]:hover,[data-sg-public-player-item][aria-current="page"]{border-color:#63e6be;color:#efffff;background:rgba(18,48,43,.5)}',
      '[data-sg-public-player-item-no]{font-size:11px;opacity:.65;letter-spacing:.08em;padding-top:2px}',
      '[data-sg-public-player-item-title]{font-size:13px;line-height:1.35}',
      '[data-sg-public-player-close]{border:0;background:transparent;color:#a8b7ba;font-size:20px;line-height:1;cursor:pointer}',
      '@media (max-width:600px){[data-sg-public-player-dock]{margin-right:8px;margin-bottom:10px}[data-sg-public-player-button]{width:34px;height:34px}[data-sg-public-player-drawer]{right:8px;bottom:60px}}'
    ].join('');
  }

  function icon(name) {
    var paths = {
      list: '<path d="M5 6h14M5 12h14M5 18h14"/><path d="M2 6h.01M2 12h.01M2 18h.01"/>',
      left: '<path d="m15 18-6-6 6-6"/>',
      right: '<path d="m9 18 6-6-6-6"/>',
      full: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5"/>',
      download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
      share: '<circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>'
    };
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || '') + '</svg>';
  }

  function pageTitle(page, index) {
    return page.getAttribute("data-sg-title") || page.getAttribute("aria-label") || ((page.querySelector("h1,h2,h3,.sg-page-title") || {}).textContent || "").trim() || ("第 " + (index + 1) + " 页");
  }

  function sync() {
    var total = pages.length;
    if (!total) return;
    current = Math.max(0, Math.min(total - 1, current));
    if (progressFill) progressFill.style.width = (((current + 1) / total) * 100) + "%";
    if (pageLabel) pageLabel.textContent = String(current + 1).padStart(2, "0") + " / " + String(total).padStart(2, "0");
    if (prevButton) prevButton.disabled = current <= 0;
    if (nextButton) nextButton.disabled = current >= total - 1;
    if (drawer) drawer.querySelectorAll("[data-sg-public-player-item]").forEach(function (item, index) {
      item.setAttribute("aria-current", index === current ? "page" : "false");
    });
  }

  function goTo(index) {
    if (!pages.length) return;
    current = Math.max(0, Math.min(pages.length - 1, Number(index) || 0));
    if (controller && typeof controller.show === "function") controller.show(current);
    else window.postMessage({ sg: "goto", index: current }, "*");
    sync();
  }

  function makeButton(label, name) {
    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-sg-public-player-button", "");
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = icon(name);
    return button;
  }

  function mount() {
    if (document.querySelector("[" + rootMarker + "]")) return;
    var style = document.createElement("style");
    style.setAttribute(MARKER + "-style", "");
    style.textContent = cssText();
    document.head.appendChild(style);

    var root = document.createElement("div");
    root.setAttribute(rootMarker, "");
    root.setAttribute("aria-label", "演示播放器");
    var progress = document.createElement("div");
    progress.setAttribute("data-sg-public-player-progress", "");
    progress.setAttribute("role", "slider");
    progress.setAttribute("aria-label", "演示进度");
    progressFill = document.createElement("span");
    progressFill.setAttribute("data-sg-public-player-progress-fill", "");
    progress.appendChild(progressFill);
    progress.addEventListener("click", function (event) {
      var rect = progress.getBoundingClientRect();
      goTo(Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * (pages.length - 1)));
    });
    root.appendChild(progress);

    drawer = document.createElement("aside");
    drawer.setAttribute("data-sg-public-player-drawer", "");
    drawer.hidden = true;
    var head = document.createElement("div");
    head.setAttribute("data-sg-public-player-drawer-head", "");
    head.innerHTML = '<span>演示目录</span>';
    var close = makeButton("关闭目录", "close");
    close.setAttribute("data-sg-public-player-close", "");
    close.addEventListener("click", function () { drawer.hidden = true; });
    head.appendChild(close);
    drawer.appendChild(head);
    var list = document.createElement("nav");
    list.setAttribute("data-sg-public-player-list", "");
    pages.forEach(function (page, index) {
      var item = document.createElement("button");
      item.type = "button";
      item.setAttribute("data-sg-public-player-item", "");
      item.setAttribute("aria-current", index === 0 ? "page" : "false");
      item.innerHTML = '<span data-sg-public-player-item-no>' + String(index + 1).padStart(2, "0") + '</span><span data-sg-public-player-item-title></span>';
      item.querySelector("[data-sg-public-player-item-title]").textContent = pageTitle(page, index);
      item.addEventListener("click", function () { goTo(index); drawer.hidden = true; });
      list.appendChild(item);
    });
    drawer.appendChild(list);
    root.appendChild(drawer);

    var dock = document.createElement("footer");
    dock.setAttribute("data-sg-public-player-dock", "");
    directoryButton = makeButton("打开演示目录", "list");
    directoryButton.addEventListener("click", function () { drawer.hidden = !drawer.hidden; });
    prevButton = makeButton("上一页", "left");
    prevButton.addEventListener("click", function () { goTo(current - 1); });
    pageLabel = document.createElement("span");
    pageLabel.setAttribute("data-sg-public-player-page", "");
    nextButton = makeButton("下一页", "right");
    nextButton.addEventListener("click", function () { goTo(current + 1); });
    var full = makeButton("全屏播放", "full");
    full.addEventListener("click", function () {
      var target = document.documentElement;
      if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen();
      else if (target.requestFullscreen) target.requestFullscreen();
    });
    var share = makeButton("分享演示", "share");
    share.addEventListener("click", function () {
      var url = location.href;
      if (navigator.share) navigator.share({ title: document.title, url: url }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () {
        share.title = "链接已复制";
        setTimeout(function () { share.title = "分享演示"; }, 1200);
      });
    });
    var downloadLink = document.querySelector(".sg-publish-download[href]");
    var download = downloadLink ? makeButton("下载演示", "download") : null;
    if (download) download.addEventListener("click", function () { location.href = downloadLink.href; });
    dock.append(directoryButton, prevButton, pageLabel, nextButton, full);
    if (download) dock.appendChild(download);
    dock.appendChild(share);
    root.appendChild(dock);
    document.body.appendChild(root);
    sync();
  }

  function boot() {
    pages = Array.prototype.slice.call(document.querySelectorAll("[data-sg-page]"));
    if (!pages.length) return;
    if (window.__sgPlatformPresentation && typeof window.__sgPlatformPresentation.show === "function") {
      controller = window.__sgPlatformPresentation;
    } else if (window.SG && typeof window.SG.presentation === "function") {
      controller = window.SG.presentation({ mode: "slide", keyboard: true, touch: true });
      window.__sgPlatformPresentation = controller;
    }
    if (uiEnabled) mount();
    window.addEventListener("message", function (event) {
      var data = event.data;
      if (!data || data.sg !== "page" || typeof data.index !== "number") return;
      current = data.index;
      sync();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && drawer && !drawer.hidden) { drawer.hidden = true; return; }
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") { event.preventDefault(); goTo(current + 1); }
      else if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); goTo(current - 1); }
      else if (event.key === "Home") { event.preventDefault(); goTo(0); }
      else if (event.key === "End") { event.preventDefault(); goTo(pages.length - 1); }
    });
    if (uiEnabled) {
      document.querySelectorAll("#sg-progress,#sg-page-no,body > .sg-nav").forEach(function (el) { el.style.display = "none"; });
    }
    sync();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
