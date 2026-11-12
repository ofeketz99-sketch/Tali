// Keyboard shortcuts are stored as physical-key labels (Ctrl+K, Alt+←, F2).
// Keeping parsing here makes the settings screen and the global listener agree.
const CODE_TO_KEY = {
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'",
  BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Space: 'Space',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
};
const KEY_TO_CODE = Object.fromEntries(Object.entries(CODE_TO_KEY).map(([code, key]) => [key, code]));

export function eventToHotkey(event) {
  if (['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(event.code)) return null;
  let key = CODE_TO_KEY[event.code];
  if (!key && /^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
  if (!key && /^Digit\d$/.test(event.code)) key = event.code.slice(5);
  if (!key && /^F(?:[1-9]|1[0-2])$/.test(event.code)) key = event.code;
  if (!key && ['Tab', 'Home', 'End', 'PageUp', 'PageDown', 'Delete', 'Insert'].includes(event.code)) key = event.code;
  if (!key) return null;
  // Plain letters and navigation keys would steal ordinary typing. Function keys may stand alone.
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !/^F\d+$/.test(key)) return null;
  return [event.ctrlKey || event.metaKey ? 'Ctrl' : null, event.shiftKey ? 'Shift' : null,
    event.altKey ? 'Alt' : null, key].filter(Boolean).join('+');
}

export function hotkeyCode(hotkey) {
  const parts = String(hotkey || '').split('+').filter(Boolean);
  const key = parts.pop();
  const code = KEY_TO_CODE[key] || (/^[A-Z]$/.test(key) ? 'Key' + key : /^\d$/.test(key) ? 'Digit' + key : key);
  return code ? { code, ctrl: parts.includes('Ctrl'), shift: parts.includes('Shift'), alt: parts.includes('Alt') } : null;
}

export function matchesHotkey(event, hotkey) {
  const parsed = hotkeyCode(hotkey);
  return !!parsed && event.code === parsed.code
    && (event.ctrlKey || event.metaKey) === parsed.ctrl
    && event.shiftKey === parsed.shift
    && event.altKey === parsed.alt;
}

export function commandHotkey(command, prefs) {
  if (!command?.id) return command?.keys || '';
  const custom = prefs?.hotkeys;
  return custom && Object.prototype.hasOwnProperty.call(custom, command.id) ? custom[command.id] : (command.keys || '');
}

