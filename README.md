# Taskday

A TickTick-style task manager that runs as a **web app** (any desktop browser, installable as a PWA) and as an **Android APK**, and syncs between devices through a plain folder that you share with **Syncthing**. No account, no server.

Everything TickTick has except the Eisenhower Matrix and Notes:

| Area | What's included |
|---|---|
| Tasks | Inbox, lists (emoji, color), folders, archived lists, sections, subtasks (unlimited nesting), checklists, descriptions, priorities, pin, Won't Do, Trash with restore, duplicate, multi-select batch edit, undo |
| Dates | Date, time, duration (start–end), reminders (multiple), repeat (daily/weekly/monthly/yearly, every N, specific weekdays, nth weekday, last day, skip weekends, ends on date / after N times, repeat from completion date) |
| Smart quick add | `Call mom tomorrow 6pm #family !high ~Personal`, `Gym every mon and thu 7am`, `Meeting fri 3pm-4:30pm`, `Pay rent in 3 days`, `Exam 15 dec`; with live highlighting and #tag / ~list autocomplete |
| Views | Today, Tomorrow, Next 7 Days, Inbox, All, Completed, Won't Do, Summary (copyable report), Trash, custom Filters (lists + tags + dates + priority + keyword), tag views with nested tags; List / Kanban / Timeline layouts; group by section/date/list/priority/tag; sort by date/priority/title/custom drag/created |
| Calendar | Month, Week, 3 Days, Day, Agenda; drag tasks between days and time slots; repeating occurrences; "arrange unscheduled tasks" tray |
| Habits | Daily on chosen weekdays / X times per week / every N days; yes-no or count goals (8 glasses, 20 pages…); morning/afternoon/night sections; reminders; streaks, monthly rate, history calendar, check-in notes, skip days, archive |
| Focus | Pomodoro (custom lengths, long-break cycle, auto-start) and stopwatch, link to a task, white noise (white/pink/brown, rain, ocean, café, clock), focus records, manual records, daily goal |
| Countdown | Countdowns, birthdays (shows age), anniversaries (days since), holidays, yearly repeats, pin, archive |
| Statistics | Completion charts, on-time vs late, by list, by priority, focus by day/task/hour, habit completion, achievement score and levels |
| Other | Search, light/dark/system themes, 8 accent colors, compact mode, text size, week start, 12/24h, keyboard shortcuts, drag & drop everywhere (mouse + long-press on touch), swipe right to complete / left to reschedule (touch), daily "plan your day" reminder, backup/restore, CSV export, **import your TickTick backup CSV** |

Not included (they need TickTick's servers or native widgets): sharing/collaboration and comments, attachments, email-to-task, location reminders, calendar subscriptions, home-screen widgets.

---

## 1. Get the Android APK (no Android Studio needed)

The APK is built for free by GitHub Actions:

1. Create a **private** repository on github.com (private, because `android-extra/taskday-release.jks` is your signing key).
2. Upload the contents of this folder (drag and drop all files on the repo page, or `git push`).
   Make sure the hidden-looking `.github/workflows/build.yml` file made it into the repo. If the Actions tab shows no workflow, use *Add file → Create new file*, name it `.github/workflows/build.yml` and paste the file's contents.
3. Open the **Actions** tab → *Build APK and web app* → it runs automatically on every push (or press *Run workflow*). It takes about 5–8 minutes.
4. Open the finished run → **Artifacts** → download `Taskday-apk` → unzip → `Taskday.apk`.
5. Copy it to your phone and open it (allow "install unknown apps" for your file manager/browser).

Every later build installs over the previous one and keeps your data, because they are all signed with the same key and the version number goes up with each run. Pushing a tag like `v1.1` also attaches the APK to a GitHub Release.

> Want your own signing key instead of the bundled one? Add repository secrets `TASKDAY_KEYSTORE_PASSWORD`, `TASKDAY_KEY_PASSWORD`, `TASKDAY_KEY_ALIAS` and replace the `.jks` file. Changing the key later means uninstalling the old app once (export a backup first).

**Building locally instead** (needs Node 20+, JDK 21, Android SDK / Android Studio):

```bash
npm install
npm run android                 # builds the web app and prepares ./android
cd android && ./gradlew assembleRelease
# -> android/app/build/outputs/apk/release/app-release.apk
```

## 2. Use the web app on your computer

Pick one:

- **GitHub Pages (recommended, gives you an https address):** in the same repo go to *Settings → Pages → Source: GitHub Actions*. The workflow then publishes the app at `https://<you>.github.io/<repo>/`. Open it in **Chrome or Edge** and click the *Install* icon in the address bar to get a desktop app window.
- **Run it locally:** `npm install && npm run build && npm start`, then open http://localhost:8080. (Opening `dist/index.html` by double-clicking does not work; browsers block modules from `file://`.)

Folder sync in the browser needs Chrome, Edge, Brave or Opera (Firefox and Safari can't access folders; they can still use the manual *Save / Merge* sync file in Settings).

## 3. Set up Syncthing sync

How it works: each device writes **only its own file** (`taskday-<device-id>.json`) into the shared folder and reads the other devices' files, merging task by task (the newest edit wins). Because no two devices ever write the same file, Syncthing never produces conflict copies. Sync runs on start, every 20 seconds while the app is open, and shortly after every change.

**On the computer**
1. Install Syncthing (https://syncthing.net) and create a folder, e.g. `Documents/Taskday`.
2. In Taskday: **Settings → Sync → Choose folder** → pick that folder → allow *Edit files*. Chrome asks again after a browser restart; click the sync icon (bottom-left) or *Reconnect folder* when it turns red.

**On the phone**
1. Install **Syncthing-Fork** (F-Droid / IzzyOnDroid; the original Syncthing Android app is discontinued).
2. Pair it with the computer and accept the shared folder; set its local path to `/storage/emulated/0/Taskday` (or any path you like).
3. In the Taskday app: **Settings → Sync** → check the folder path → **1. Allow file access** (Android shows "All files access" — switch it on for Taskday and go back) → **2. Turn on sync**.

Optional: add `.*.tmp` to the folder's ignore patterns in Syncthing (the app writes through a hidden temp file for safety).

Old devices: if you reinstall the app or clear browser data, that device gets a new id and a new file; the old file is merged harmlessly. Delete stale `taskday-*.json` files from the folder whenever you like (only after the other devices have synced).

## 4. Move over from TickTick

In TickTick: *Settings → Account → Backup & Restore → Generate backup* (a `.csv`). In Taskday: *Settings → Data → Import CSV*. Lists, folders, sections (kanban columns), tags, dates, reminders, repeats, priorities, checklists, subtasks and completed history come across; notes are skipped.

## 5. Shortcuts (desktop)

`N` new task · `/` or `Ctrl+K` search · `Esc` close · `Alt+1…7` switch section · `Ctrl+Z` undo · `Delete` delete open task · `Ctrl+Enter` complete open task · `Tab`/`Shift+Tab` indent/outdent · `Shift/Ctrl+click` multi-select · right-click for the task menu. In quick add: `#tag`, `!high|!medium|!low`, `~List name`.

## Project layout

```
src/                 app source (React, no other runtime libraries)
  store.js           data model, last-writer-wins records, undo
  lib/sync.js        Syncthing folder sync (web + Android)
  lib/nlp.js         natural-language quick add
  lib/repeat.js      recurrence engine
  lib/notify.js      reminders (browser + Android notifications)
  lib/focus.js       pomodoro / stopwatch
  views/             Tasks, Calendar, Habits, Focus, Countdown, Stats, Search, Settings
android-extra/       native plugin for folder access, icons, splash, signing key
scripts/             build, Android build, local server, tests
.github/workflows/   builds the APK and publishes the web app
```

Tests: `npm test` (parser, recurrence, merge, habit streaks, and a two-device sync simulation).
