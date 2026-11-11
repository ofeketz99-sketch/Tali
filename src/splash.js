/* Tali startup intro. Standalone: app startup never awaits the intro or its assets.
 *
 * The book sequence is a pre-rendered video (splash.webm, 1920x1080 @ 60 fps, rendered by
 * tools/splash-render). Its first frame is the flat identity blue and its last frame is the
 * white emblem alone on that blue, so the overlay background matches both ends. When the
 * video ends its last frame simply stays on screen for the hold, then the whole overlay fades
 * out over the app, which has been rendering underneath all along. (Until 3.8 a native emblem
 * image replaced the last frame; it sat within a pixel, but it was thinner and lacked the
 * rendered highlight, so the logo seemed to jump. The image is now only the fallback when
 * there is no video: reduced motion, or a video error.) */
(() => {
  const preview = document.body.hasAttribute('data-splash-preview');
  const key = 'tali:splash:seen';
  try { if (!preview && sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* Storage can be unavailable. */ }

  // Must match tools/splash-render/scene.mjs.
  const VIDEO_W = 1920, VIDEO_H = 1080, EMBLEM_FRACTION = 0.56;
  const HOLD_MS = 280, FADE_MS = 520, FADE_IN_MS = 1400, START_MAX_WAIT_MS = 1400, WATCHDOG_MS = 9500;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const root = document.createElement('div');
  root.className = 'tali-splash';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'פתיח Tali');
  root.setAttribute('aria-modal', 'true');
  root.tabIndex = -1;
  root.innerHTML = (reduced ? '' : '<video class="tali-splash__video" muted playsinline preload="auto" disablepictureinpicture disableremoteplayback aria-hidden="true" src="splash.webm"></video>')
    + '<img class="tali-splash__emblem" src="splash-emblem.png" alt="" aria-hidden="true" />'
    + '<button class="tali-splash__skip" type="button">דלג על הפתיח</button>';
  const video = root.querySelector('video');
  const emblem = root.querySelector('img');
  const skip = root.querySelector('button');
  const previousFocus = document.activeElement;
  const blocked = [];
  let ended = false, fading = false, watchdog, holdTimer;

  function finish() {
    if (ended) return;
    ended = true;
    clearTimeout(watchdog); clearTimeout(holdTimer);
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); } // release the decoder
    root.remove();
    blocked.forEach(el => { el.inert = false; });
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVisibility);
    removeEventListener('resize', layout);
    if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus({ preventScroll: true });
  }
  function onKey(event) {
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(); }
    else if (event.code === 'Tab') { event.preventDefault(); skip.focus(); }
    else event.stopImmediatePropagation(); // Do not trigger app shortcuts behind the intro.
  }
  function onVisibility() { if (document.hidden) finish(); }

  // Same geometry as the video under object-fit: cover, so the hand-off is pixel-aligned.
  function layout() {
    const scale = Math.max(innerWidth / VIDEO_W, innerHeight / VIDEO_H);
    const size = EMBLEM_FRACTION * VIDEO_H * scale;
    emblem.style.width = emblem.style.height = size + 'px';
  }

  // The last frame is flat blue + emblem. Match the overlay to the decoded colour so the
  // swap from video to native emblem cannot show a seam, whatever the YUV conversion did.
  function matchDecodedBackground() {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 8;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(video, 0, 0, 64, 36, 0, 0, 8, 8);
      const d = g.getImageData(0, 0, 8, 8).data;
      let r = 0, gr = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      root.style.backgroundColor = `rgb(${Math.round(r / n)}, ${Math.round(gr / n)}, ${Math.round(b / n)})`;
    } catch { /* keep the CSS colour */ }
  }

  function holdAndFade() {
    if (ended || fading) return;
    fading = true;
    if (video && !video.error) {
      matchDecodedBackground();         // the ended video keeps its last frame: no swap, no jump
    } else {
      root.classList.add('is-logo');    // no video (reduced motion or error): the native emblem
      if (video) video.hidden = true;
    }
    holdTimer = setTimeout(() => {
      if (ended) return;
      const fade = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      fade.finished.then(finish, finish);
    }, reduced ? 650 : HOLD_MS);
  }

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
  addEventListener('resize', layout);
  skip.addEventListener('click', finish);
  root.addEventListener('pointerdown', finish);
  root.focus({ preventScroll: true }); // Tab reveals the skip button (focus-visible only).
  layout();
  watchdog = setTimeout(finish, WATCHDOG_MS); // Independent fail-open watchdog.
  emblem.addEventListener('error', finish);

  if (!video) { // Reduced motion: the identity only, then a short fade.
    emblem.decode().then(holdAndFade, finish);
  } else {
    video.addEventListener('ended', holdAndFade);
    video.addEventListener('error', finish);
    // Start only once the app's own scripts have run and the decoder is ready: playing during
    // the heavy app start-up made the first frames stall and jump. Until then the overlay is
    // the flat identity blue, and the video fades in from it on its first presented frame.
    let started = false;
    const start = () => {
      if (started || ended) return;
      started = true;
      video.play().then(() => {
        const fadeIn = () => {
          if (ended) return;
          // Slow, sine-like start so the white page never "switches on" against the blue,
          // with a slight settle of scale. Opacity and transform stay on the compositor.
          video.animate([
            { opacity: 0, transform: 'scale(1.035)' },
            { opacity: .1, offset: .25 },
            { opacity: .42, offset: .5 },
            { opacity: .82, offset: .75 },
            { opacity: 1, transform: 'scale(1)' },
          ], { duration: FADE_IN_MS, easing: 'cubic-bezier(.37,0,.63,1)', fill: 'forwards' });
        };
        if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(fadeIn); else fadeIn();
      }, finish);
    };
    const appLoaded = new Promise(res => (document.readyState === 'complete' ? res() : addEventListener('load', res, { once: true })));
    const decoderReady = new Promise(res => (video.readyState >= 4 ? res() : video.addEventListener('canplaythrough', res, { once: true })));
    Promise.all([appLoaded, decoderReady])
      .then(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))))
      .then(start);
    setTimeout(start, START_MAX_WAIT_MS); // never wait on a slow start-up for long
  }
  if (preview) window.taliSplashPreview = { finish, video };
})();
