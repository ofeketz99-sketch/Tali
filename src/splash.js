/* Standalone: app startup never awaits the intro or its assets. No dependencies. */
(() => {
  const preview = document.body.hasAttribute('data-splash-preview');
  const key = 'tali:splash:seen';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  try { if (!preview && sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* Storage can be unavailable. */ }
  if (motion.matches) return;

  const root = document.createElement('div');
  root.className = 'tali-splash';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'פתיח Tali');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `<canvas class="tali-splash__canvas" aria-hidden="true"></canvas><img class="tali-splash__asset" src="logo.png" alt="" hidden /><button class="tali-splash__skip" type="button">דלג על הפתיח</button>`;
  const previousFocus = document.activeElement;
  const blocked = [];
  const animations = [];
  let ended = false;
  let deadline;
  let frame;
  function finish() {
    if (ended) return;
    ended = true;
    clearTimeout(deadline);
    cancelAnimationFrame(frame);
    animations.forEach(a => a.cancel());
    root.remove();
    blocked.forEach(el => { el.inert = false; });
    document.removeEventListener('keydown', onKey, true);
    motion.removeEventListener('change', finish);
    document.removeEventListener('visibilitychange', onVisibility);
    if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus({ preventScroll: true });
  }
  function onKey(event) {
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(); }
    else if (event.code === 'Tab') { event.preventDefault(); root.querySelector('button').focus(); }
    else event.stopImmediatePropagation(); // Do not trigger app shortcuts behind the intro.
  }
  function onVisibility() { if (document.hidden) finish(); }
  document.body.append(root);
  // If the stylesheet or animation API failed, leave the application usable.
  if (getComputedStyle(root).position !== 'fixed' || !root.animate) { root.remove(); return; }
  for (const el of document.body.children) {
    if (el !== root && !el.inert && !['SCRIPT', 'LINK'].includes(el.tagName)) { el.inert = true; blocked.push(el); }
  }
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('visibilitychange', onVisibility);
  motion.addEventListener('change', finish);
  root.querySelector('button').addEventListener('click', finish);
  root.querySelector('button').focus({ preventScroll: true });
  root.querySelectorAll('img').forEach(img => { img.addEventListener('error', finish); if (img.complete && !img.naturalWidth) finish(); });
  if (ended) return;
  deadline = setTimeout(finish, 4750); // Independent fail-open watchdog.
  const animate = (el, frames, duration = 4650, delay = 0) => {
    const animation = el.animate(frames, { duration, delay, fill: 'both', easing: 'linear' });
    animations.push(animation);
    return animation;
  };
  try {
    if (!window.TaliSplashArt) { finish(); return; }
    const timeline = animate(root, [{ opacity: 1, offset: 0 }, { opacity: 1, offset: 4250 / 4650 }, { opacity: 0, offset: 1 }]);
    timeline.finished.then(finish, () => {});
    const logo = root.querySelector('img');
    logo.decode().then(() => {
      if (ended) return;
      const art = new window.TaliSplashArt(root.querySelector('canvas'), logo);
      const paint = () => {
        if (ended) return;
        try { art.draw(Number(timeline.currentTime) || 0); frame = requestAnimationFrame(paint); }
        catch { finish(); }
      };
      paint();
    }).catch(finish);
    if (preview) window.taliSplashPreview = { animations, finish };
  } catch { finish(); }
})();
