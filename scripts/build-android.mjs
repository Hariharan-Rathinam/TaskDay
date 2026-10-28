// Prepares the Android project in ./android from the web build.
// Requires: npm install (Capacitor packages), JDK 21 + Android SDK for the final Gradle step.
// Usage: node scripts/build-android.mjs   then   cd android && ./gradlew assembleRelease
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sh = (cmd) => { console.log('$ ' + cmd); if (process.env.SKIP_CAP && cmd.startsWith('npx cap')) return; execSync(cmd, { stdio: 'inherit', cwd: root }); };
const extra = path.join(root, 'android-extra');

// 1. web build + Capacitor plugin shim
sh('node scripts/build.mjs');
await esbuild.build({ entryPoints: [path.join(extra, 'cap-shim.js')], bundle: true, format: 'iife', outfile: path.join(root, 'dist/assets/cap-shim.js'), minify: true, target: ['chrome100'] });
const idx = path.join(root, 'dist/index.html');
let html = fs.readFileSync(idx, 'utf8');
html = html.replace('<script type="module" src="assets/main.js"></script>', '<script src="assets/cap-shim.js"></script>\n  <script type="module" src="assets/main.js"></script>');
html = html.replace('<link rel="manifest" href="manifest.webmanifest" />', '');
fs.writeFileSync(idx, html);
fs.rmSync(path.join(root, 'dist/sw.js'), { force: true }); // no service worker inside the app

// 2. native project
if (!fs.existsSync(path.join(root, 'android'))) sh('npx cap add android');

const main = path.join(root, 'android/app/src/main');
const javaDir = path.join(main, 'java/com/taskday/app');
fs.mkdirSync(javaDir, { recursive: true });
for (const f of fs.readdirSync(javaDir)) if (f.endsWith('.kt')) fs.rmSync(path.join(javaDir, f)); // template uses Java, but be safe
fs.copyFileSync(path.join(extra, 'StorageAccessPlugin.java'), path.join(javaDir, 'StorageAccessPlugin.java'));
fs.copyFileSync(path.join(extra, 'MainActivity.java'), path.join(javaDir, 'MainActivity.java'));

// 3. manifest: permissions for the sync folder, notifications and exact alarms
const mf = path.join(main, 'AndroidManifest.xml');
let m = fs.readFileSync(mf, 'utf8');
const perms = [
  '<uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
  '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />',
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />',
  '<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />',
  '<uses-permission android:name="android.permission.VIBRATE" />',
  '<uses-permission android:name="android.permission.WAKE_LOCK" />',
];
for (const p of perms) {
  const name = p.match(/android:name="([^"]+)"/)[1];
  if (!m.includes(`"${name}"`)) m = m.replace(/(\s*)<application/, `$1${p}$1<application`);
}
if (!m.includes('requestLegacyExternalStorage')) m = m.replace('<application', '<application\n        android:requestLegacyExternalStorage="true"');
fs.writeFileSync(mf, m);

// 4. resources: icons, splash, notification icon, colors and system bar theme
const copyDir = (src, dst) => { for (const f of fs.readdirSync(src)) { const s = path.join(src, f), d = path.join(dst, f); if (fs.statSync(s).isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyDir(s, d); } else fs.copyFileSync(s, d); } };
const res = path.join(main, 'res');
copyDir(path.join(extra, 'res'), res);
fs.writeFileSync(path.join(res, 'values/ic_launcher_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#4772FA</color>\n</resources>\n');
fs.mkdirSync(path.join(res, 'values-night'), { recursive: true });
fs.writeFileSync(path.join(res, 'values/td_colors.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="td_bg">#FFFFFF</color>\n    <bool name="td_light_bars">true</bool>\n</resources>\n');
fs.writeFileSync(path.join(res, 'values-night/td_colors.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="td_bg">#1C1C1F</color>\n    <bool name="td_light_bars">false</bool>\n</resources>\n');
const stylesPath = path.join(res, 'values/styles.xml');
let styles = fs.readFileSync(stylesPath, 'utf8');
if (!styles.includes('td_bg')) {
  styles = styles.replace(/(<style name="AppTheme\.NoActionBar"[^>]*>)/, `$1
        <item name="android:windowBackground">@color/td_bg</item>
        <item name="android:statusBarColor">@color/td_bg</item>
        <item name="android:navigationBarColor">@color/td_bg</item>
        <item name="android:windowLightStatusBar">@bool/td_light_bars</item>`);
  fs.writeFileSync(stylesPath, styles);
}

// 5. signing + version (so new APKs install over old ones)
const gradlePath = path.join(root, 'android/app/build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');
const run = Number(process.env.GITHUB_RUN_NUMBER || process.env.VERSION_CODE || Math.floor(Date.now() / 60000) % 2000000000);
gradle = gradle.replace(/versionCode \d+/, `versionCode ${run}`).replace(/versionName "[^"]*"/, `versionName "1.0.${run}"`);
if (!gradle.includes('taskdayRelease')) {
  gradle += `
android {
    signingConfigs {
        taskdayRelease {
            storeFile file(System.getenv("TASKDAY_KEYSTORE") ?: "../../android-extra/taskday-release.jks")
            storePassword System.getenv("TASKDAY_KEYSTORE_PASSWORD") ?: "taskday-local"
            keyAlias System.getenv("TASKDAY_KEY_ALIAS") ?: "taskday"
            keyPassword System.getenv("TASKDAY_KEY_PASSWORD") ?: "taskday-local"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.taskdayRelease
            minifyEnabled false
        }
    }
}
`;
}
fs.writeFileSync(gradlePath, gradle);

// 6. copy web assets + plugins into the native project
sh('npx cap sync android');
console.log('\nAndroid project ready. Build the APK with:\n  cd android && ./gradlew assembleRelease\nOutput: android/app/build/outputs/apk/release/app-release.apk');
