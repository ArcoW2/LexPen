// Runs before first paint so the window never flashes the wrong theme.
document.documentElement.dataset.theme =
  new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light';
