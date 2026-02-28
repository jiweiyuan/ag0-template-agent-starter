/**
 * "Built by ag0" badge — injected into deployed agents on free-tier.
 *
 * Renders a fixed-position SVG link in the bottom-right corner.
 */

const BADGE_SVG = await Deno.readTextFile(
  new URL("./badge.svg", import.meta.url),
);

const BADGE_DATA_URI = "data:image/svg+xml;base64," + btoa(BADGE_SVG);

/** Returns a self-executing script that appends the ag0 badge to the page. */
export function buildBadgeScript(): string {
  const BADGE_ID = "ag0-badge";

  return `(function() {
  "use strict";
  function init() {
    if (document.getElementById("${BADGE_ID}")) return;
    var a = document.createElement("a");
    a.id = "${BADGE_ID}";
    a.href = "https://ag0.io";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = "Built by ag0";
    a.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:9999;opacity:0.9;transition:opacity 0.2s;text-decoration:none;";
    a.addEventListener("mouseenter", function() { a.style.opacity = "1"; });
    a.addEventListener("mouseleave", function() { a.style.opacity = "0.9"; });
    var img = document.createElement("img");
    img.src = "${BADGE_DATA_URI}";
    img.alt = "Built by ag0";
    img.style.cssText = "display:block;width:auto;height:59px;";
    a.appendChild(img);
    document.body.appendChild(a);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})()`;
}
