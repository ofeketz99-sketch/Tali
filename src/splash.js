/* Tali startup intro (since 5.6): the identity blue with the emblem only. The emblem rises into
 * place (fade + a slight scale), holds briefly, then the whole overlay fades out over the app,
 * which has been rendering underneath all along. About 1.3 s in total.
 *
 * Only opacity and transform are animated, so it runs on the compositor and stays smooth even
 * while the app is still starting up underneath. Standalone: app startup never awaits the intro.
 *
 * Until 5.5 this was a pre-rendered 5.2 s video of a book (splash.webm, tools/splash-render).
 * The user asked for something simpler and smoother; the video is no longer loaded. */
(() => {
  const preview = document.body.hasAttribute('data-splash-preview');
  const key = 'tali:splash:seen';
  try { if (!preview && sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* Storage can be unavailable. */ }

  const IN_MS = 560, HOLD_MS = 320, OUT_MS = 460, WATCHDOG_MS = 4000;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const root = document.createElement('div');
  root.className = 'tali-splash';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'פתיח Tali');
  root.setAttribute('aria-modal', 'true');
  root.tabIndex = -1;
  root.innerHTML = '<img class="tali-splash__emblem" src="splash-emblem.png" alt="" aria-hidden="true" />'
    + '<button class="tali-splash__skip" type="button">דלג על הפתיח</button>';
  const emblem = root.querySelector('img');
  const skip = root.querySelector('button');
  const previousFocus = document.activeElement;
  const blocked = [];
  let ended = false, watchdog;

  function finish() {
    if (ended) return;
    ended = true;
    clearTimeout(watchdog);
    root.remove();
    blocked.forEach(el => { el.inert = false; });
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVisibility);
    if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus({ preventScroll: true });
  }
  function onKey(event) {
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(); }
    else if (event.code === 'Tab') { event.preventDefault(); skip.focus(); }
    else event.stopImmediatePropagation(); // Do not trigger app shortcuts behind the intro.
  }
  function onVisibility() { if (document.hidden) finish(); }

  document.body.append(root);
  // If the stylesheet or animation API failed, leave the application usable.
  if (getComputedStyle(root).position !== 'fixed' || !root.animate) { root.remove(); return; }
  // The script runs at the top of <body>, so the app's markup may still be parsing.
  const blockApp = () => {
    if (ended) return;
    for (const el of document.body.children) {
      if (el !== root && !el.inert && !['SCRIPT', 'LINK'].includes(el.tagName)) { el.inert = true; blocked.push(el); }
    }
  };
  blockApp();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', blockApp, { once: true });
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('visibilitychange', onVisibility);
  skip.addEventListener('click', finish);
  root.addEventListener('pointerdown', finish);
  root.focus({ preventScroll: true }); // Tab reveals the skip button (focus-visible only).
  watchdog = setTimeout(finish, WATCHDOG_MS); // Independent fail-open watchdog.
  emblem.addEventListener('error', finish);

  const ease = 'cubic-bezier(.22,.61,.36,1)';
  async function run() {
    // In: the emblem rises into place. Reduced motion: opacity only, shorter.
    await emblem.animate(reduced
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translate(-50%, -50%) translateY(10px) scale(.94)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }],
    { duration: reduced ? 240 : IN_MS, easing: ease, fill: 'forwards' }).finished;
    if (ended) return;
    await new Promise(res => setTimeout(res, reduced ? 380 : HOLD_MS));
    if (ended) return;
    // Out: the overlay fades away over the app; the emblem eases a touch larger as it goes.
    if (!reduced) emblem.animate([{ transform: 'translate(-50%, -50%) scale(1)' }, { transform: 'translate(-50%, -50%) scale(1.04)' }], { duration: OUT_MS, easing: ease, fill: 'forwards' });
    await root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced ? 260 : OUT_MS, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished;
    finish();
  }
  // Start once the emblem is decoded and the app's own start-up work is done (window load + two
  // frames): measured in 5.6, the first ~160 ms of start-up have 40–100 ms frames, and the emblem
  // stuttered if it started rising then. Never wait more than START_MAX_WAIT_MS; until then the
  // screen is the flat blue (the same colour as the window background in main.js).
  // The app keeps working after "load" (restoring tabs, opening a note), so rather than guess an
  // event we wait for the frames themselves to settle: STABLE_FRAMES frames in a row under 25 ms.
  // The intro script runs before the app's scripts, so frames are calm at first too: start
  // counting only after the window's load event.
  const START_MAX_WAIT_MS = 900, STABLE_FRAMES = 4;
  const loaded = new Promise(res => (document.readyState === 'complete' ? res() : addEventListener('load', res, { once: true })));
  const settled = loaded.then(() => new Promise(res => {
    let last = performance.now(), calm = 0;
    const tick = (t) => {
      calm = t - last < 25 ? calm + 1 : 0;
      last = t;
      if (calm >= STABLE_FRAMES) res(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  const capped = new Promise(res => setTimeout(res, START_MAX_WAIT_MS));
  Promise.all([emblem.decode(), Promise.race([settled, capped])])
    .then(() => { window.__splashStart = performance.now(); run().catch(finish); }, finish);
  if (preview) window.taliSplashPreview = { finish };
})();
