// Key codes and constants for the extension

export const KEY_TYPES = {
  LETTER: 'letter',
  NUMBER: 'number',
  SPECIAL: 'special',
  ARROW: 'arrow',
  FUNCTION: 'function'
};

export const SPECIAL_KEYS = {
  Space: { code: 'Space', keyCode: 32, key: ' ' },
  Enter: { code: 'Enter', keyCode: 13, key: 'Enter' },
  Tab: { code: 'Tab', keyCode: 9, key: 'Tab' },
  Escape: { code: 'Escape', keyCode: 27, key: 'Escape' },
  Backspace: { code: 'Backspace', keyCode: 8, key: 'Backspace' },
  Delete: { code: 'Delete', keyCode: 46, key: 'Delete' },
  Home: { code: 'Home', keyCode: 36, key: 'Home' },
  End: { code: 'End', keyCode: 35, key: 'End' },
  PageUp: { code: 'PageUp', keyCode: 33, key: 'PageUp' },
  PageDown: { code: 'PageDown', keyCode: 34, key: 'PageDown' }
};

export const ARROW_KEYS = {
  ArrowUp: { code: 'ArrowUp', keyCode: 38, key: 'ArrowUp' },
  ArrowDown: { code: 'ArrowDown', keyCode: 40, key: 'ArrowDown' },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37, key: 'ArrowLeft' },
  ArrowRight: { code: 'ArrowRight', keyCode: 39, key: 'ArrowRight' }
};

export const FUNCTION_KEYS = {};
for (let i = 1; i <= 12; i++) {
  FUNCTION_KEYS[`F${i}`] = { code: `F${i}`, keyCode: 111 + i, key: `F${i}` };
}

export const MOUSE_ACTIONS = {
  leftClick: { type: 'click', button: 0, label: 'Left Click' },
  rightClick: { type: 'contextmenu', button: 2, label: 'Right Click' },
  middleClick: { type: 'click', button: 1, label: 'Middle Click' },
  doubleClick: { type: 'dblclick', button: 0, label: 'Double Click' }
};

export const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Meta'];

export const TIME_UNITS = {
  seconds: { label: 'Seconds', multiplier: 1 },
  minutes: { label: 'Minutes', multiplier: 60 },
  hours: { label: 'Hours', multiplier: 3600 }
};

// Generate letter keys A-Z
export const LETTER_KEYS = {};
for (let i = 65; i <= 90; i++) {
  const letter = String.fromCharCode(i);
  LETTER_KEYS[letter] = { code: `Key${letter}`, keyCode: i, key: letter.toLowerCase() };
}

// Generate number keys 0-9
export const NUMBER_KEYS = {};
for (let i = 0; i <= 9; i++) {
  NUMBER_KEYS[i.toString()] = { code: `Digit${i}`, keyCode: 48 + i, key: i.toString() };
}

// All keys combined for dropdown
export const ALL_KEYS = {
  ...LETTER_KEYS,
  ...NUMBER_KEYS,
  ...SPECIAL_KEYS,
  ...ARROW_KEYS,
  ...FUNCTION_KEYS
};

export function getKeyInfo(keyName) {
  return ALL_KEYS[keyName] || null;
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
