// Loaded only in the Android build, before the app: registers the native plugins with Capacitor's JS runtime
// so the app can reach them as window.Capacitor.Plugins.<Name>.
import { Capacitor, registerPlugin } from '@capacitor/core';

const w = window;
w.Capacitor = w.Capacitor || Capacitor;
const plugins = (w.Capacitor.Plugins = w.Capacitor.Plugins || {});
for (const name of ['StorageAccess', 'LocalNotifications', 'App']) {
  if (!plugins[name]) plugins[name] = registerPlugin(name);
}
document.documentElement.classList.add('native');
