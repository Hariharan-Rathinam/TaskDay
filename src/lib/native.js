// Minimal bridge to Capacitor native plugins (Android APK). No-ops in the browser.
const cap = () => (typeof window !== 'undefined' ? window.Capacitor : null);

export function isNative() {
  const c = cap();
  if (!c) return false;
  if (typeof c.isNativePlatform === 'function') return c.isNativePlatform();
  return typeof c.getPlatform === 'function' && c.getPlatform() !== 'web';
}

export async function callNative(plugin, method, options = {}) {
  const c = cap();
  if (!c) throw new Error('Not running in the app');
  const p = c.Plugins && c.Plugins[plugin];
  if (p && typeof p[method] === 'function') return p[method](options);
  if (typeof c.nativePromise === 'function') return c.nativePromise(plugin, method, options);
  throw new Error(`Native plugin ${plugin} unavailable`);
}

export function addNativeListener(plugin, eventName, cb) {
  const c = cap();
  if (!c) return null;
  try {
    const p = c.Plugins && c.Plugins[plugin];
    if (p && typeof p.addListener === 'function') return p.addListener(eventName, cb);
    if (typeof c.nativeCallback === 'function') return c.nativeCallback(plugin, 'addListener', { eventName }, cb);
  } catch (e) { console.warn('listener failed', plugin, eventName, e); }
  return null;
}

// --- Folder access (custom StorageAccess plugin, see android-extra/) ---
export const Storage = {
  check: () => callNative('StorageAccess', 'check'),
  request: () => callNative('StorageAccess', 'request'),
  list: (path) => callNative('StorageAccess', 'list', { path }),
  read: (path) => callNative('StorageAccess', 'read', { path }),
  write: (path, data) => callNative('StorageAccess', 'write', { path, data }),
  mkdir: (path) => callNative('StorageAccess', 'mkdir', { path }),
};

// --- Local notifications (@capacitor/local-notifications) ---
export const LocalNotif = {
  requestPermissions: () => callNative('LocalNotifications', 'requestPermissions'),
  checkPermissions: () => callNative('LocalNotifications', 'checkPermissions'),
  schedule: (notifications) => callNative('LocalNotifications', 'schedule', { notifications }),
  cancel: (ids) => callNative('LocalNotifications', 'cancel', { notifications: ids.map((id) => ({ id })) }),
  getPending: () => callNative('LocalNotifications', 'getPending'),
  createChannel: (ch) => callNative('LocalNotifications', 'createChannel', ch),
};

export function onBackButton(cb) { return addNativeListener('App', 'backButton', cb); }
export function exitApp() { return callNative('App', 'minimizeApp').catch(() => callNative('App', 'exitApp')); }
export function vibrate() { try { navigator.vibrate?.(15); } catch { /* ignore */ } }
