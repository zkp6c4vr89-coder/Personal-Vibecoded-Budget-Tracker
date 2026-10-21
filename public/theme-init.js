// Runs before first paint so the page never flashes the wrong theme.
(function () {
  try {
    var stored = localStorage.getItem('theme'); // 'light' | 'dark' | null (= system)
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || (stored !== 'light' && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
    // Keep the boot decision in sync when the OS switches themes.
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', function (e) {
        if (localStorage.getItem('theme')) return; // explicit choice wins
        document.documentElement.classList.toggle('dark', e.matches);
      });
  } catch (e) {
    /* ignore */
  }
})();
