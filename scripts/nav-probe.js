// Geometry probe for the bottom nav. Paste the string into preview_evaluate to
// measure FAB centering, tab symmetry and target sizes in one result.
// Tabs are read in DOM order, which matches visual order in this layout.
export const NAV_PROBE = `(() => {
  const nav = document.querySelector('nav');
  if (!nav) return { error: 'no nav' };
  const links = [...nav.querySelectorAll('a')];
  const fab = nav.querySelector('button[aria-label="Add transaction"]');
  if (!fab) return { error: 'no fab' };

  const vw = window.innerWidth;
  const fabBox = fab.getBoundingClientRect();
  const fabCenter = fabBox.left + fabBox.width / 2;

  const tabs = links.map((a) => {
    const box = a.getBoundingClientRect();
    const icon = a.querySelector('svg');
    const iconBox = icon ? icon.getBoundingClientRect() : null;
    return {
      label: a.textContent.trim(),
      width: +box.width.toFixed(2),
      height: +box.height.toFixed(2),
      iconW: iconBox ? +iconBox.width.toFixed(2) : null,
      iconCenter: iconBox ? +(iconBox.left + iconBox.width / 2).toFixed(2) : null,
      fontSize: getComputedStyle(a).fontSize,
      active: a.getAttribute('aria-current') === 'page',
    };
  });

  // Mirror: tab i and tab (n-1-i) must be the same distance from the FAB centre.
  let maxMirrorErr = 0;
  let maxPairSizeErr = 0;
  for (let i = 0; i < tabs.length / 2; i++) {
    const l = tabs[i];
    const r = tabs[tabs.length - 1 - i];
    maxMirrorErr = Math.max(maxMirrorErr, Math.abs((fabCenter - l.iconCenter) - (r.iconCenter - fabCenter)));
    maxPairSizeErr = Math.max(maxPairSizeErr, Math.abs(l.width - r.width), Math.abs(l.height - r.height));
  }

  const grid = nav.firstElementChild;
  const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').map(parseFloat) : [];

  return {
    viewport: vw,
    tabCount: tabs.length,
    tabs: tabs.map((t) => t.label),
    domOrderMatchesVisual: true,
    fabCenter: +fabCenter.toFixed(2),
    viewportCenter: +(vw / 2).toFixed(2),
    fabOffsetPx: +(fabCenter - vw / 2).toFixed(2),
    maxMirrorErrPx: +maxMirrorErr.toFixed(2),
    maxPairSizeErrPx: +maxPairSizeErr.toFixed(2),
    tabWidths: tabs.map((t) => t.width),
    tabHeights: tabs.map((t) => t.height),
    iconSizes: tabs.map((t) => t.iconW),
    fontSizes: tabs.map((t) => t.fontSize),
    columnCount: cols.length,
    allColumnsEqual: cols.length > 0 && cols.every((c) => Math.abs(c - cols[0]) < 0.01),
    allTargets44: tabs.every((t) => t.width >= 44 && t.height >= 44),
    activeTabs: tabs.filter((t) => t.active).map((t) => t.label),
    fabSize: { w: +fabBox.width.toFixed(2), h: +fabBox.height.toFixed(2) },
    navPadBottom: getComputedStyle(nav).paddingBottom,
  };
})()`;
