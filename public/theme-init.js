// Runs before first paint so the page never flashes the wrong theme.
(function () {
  try {
    var t = localStorage.getItem('theme');
    var dark =
      t === 'dark' ||
      (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {
    /* ignore */
  }
})();