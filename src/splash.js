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
  const ink = `<svg class="tali-splash__ink" viewBox="0 0 210 280" aria-hidden="true"><g>${Array.from({ length: 9 }, (_, i) => {
    const y = 51 + i * 20;
    return `<path d="M31 ${y} q8 -7 15 0 t14 -1 m8 0 q8 -8 14 0 t19 -2 m9 1 q7 -6 13 0 t20 -1 ${i % 3 ? 'm8 0 l15 -2' : ''}"/>`;
  }).join('')}</g><path opacity=".35" d="M31 235 Q83 230 124 236"/></svg>`;
  const face = `<div class="tali-splash__face">${ink}</div><div class="tali-splash__face tali-splash__face--back">${ink}</div>`;
  root.innerHTML = `<div class="tali-splash__stage" aria-hidden="true"><div class="tali-splash__camera"><div class="tali-splash__book"><div class="tali-splash__half tali-splash__half--left">${ink}</div><div class="tali-splash__half tali-splash__half--right">${ink}</div><div class="tali-splash__leaf tali-splash__cover"><div class="tali-splash__face">${ink}</div><div class="tali-splash__face tali-splash__face--back"><img src="logo.png" alt="" /></div></div>${Array.from({ length: 5 }, () => `<div class="tali-splash__leaf tali-splash__page">${face}</div>`).join('')}</div></div><img class="tali-splash__logo" src="logo.png" alt="" /></div><button class="tali-splash__skip" type="button">דלג על הפתיח</button>`;
  const previousFocus = document.activeElement;
  const blocked = [];
  const animations = [];
  let ended = false;
  let deadline;
  function finish() {
    if (ended) return;
    ended = true;
    clearTimeout(deadline);
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
  deadline = setTimeout(finish, 3100); // Independent fail-open watchdog.
  const animate = (el, frames, duration = 3000, delay = 0) => {
    const animation = el.animate(frames, { duration, delay, fill: 'both', easing: 'linear' });
    animations.push(animation);
    return animation;
  };
  try {
    const ease = 'cubic-bezier(.22,.7,.18,1)';
    animate(root, [{ opacity: 1, offset: 0 }, { opacity: 1, offset: .87 }, { opacity: 0, offset: 1 }]).finished.then(finish, () => {});
    animate(root.querySelector('.tali-splash__stage'), [{ opacity: 0 }, { opacity: 1, offset: .08 }, { opacity: 1 }]);
    animate(root.querySelector('.tali-splash__camera'), [
      { transform: 'translateX(-200px) scale(4.8) rotateX(26deg) rotateZ(-9deg)', easing: ease },
      { transform: 'translateX(0px) scale(1) rotateX(20deg) rotateZ(-6deg)', offset: .5, easing: ease },
      { transform: 'translateX(105px) scale(1) rotateX(0deg) rotateZ(0deg)', offset: .73 },
      { transform: 'translateX(105px) scale(1) rotateX(0deg) rotateZ(0deg)' }
    ]);
    const pages = [...root.querySelectorAll('.tali-splash__page')];
    pages.forEach((page, i) => {
      // The top sheet turns first; each successive sheet covers the last on the left.
      const delay = 230 + (pages.length - 1 - i) * 145;
      animate(page, [{ transform: `translateZ(${i + 2}px) rotateY(0deg)`, easing: ease }, { transform: `translateZ(${15 - i}px) rotateY(-180deg)` }], 640, delay);
    });
    animate(root.querySelector('.tali-splash__cover'), [{ transform: 'translateZ(1px) rotateY(0deg)', easing: ease }, { transform: 'translateZ(30px) rotateY(-180deg)' }], 680, 1370);
    animate(root.querySelector('.tali-splash__half--right'), [{ opacity: 1 }, { opacity: 0 }], 180, 1830);
    animate(root.querySelector('.tali-splash__camera'), [{ opacity: 1 }, { opacity: 0 }], 320, 2180);
    animate(root.querySelector('.tali-splash__logo'), [{ opacity: 0 }, { opacity: 1 }], 280, 2180);
    if (preview) window.taliSplashPreview = { animations, finish };
  } catch { finish(); }
})();
