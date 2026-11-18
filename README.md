# EighteenEleven

A calm, fully offline **home library tracker** for Android (built with Expo / React Native).

All data lives **on the phone** in a local SQLite database: no account, no login, no server. Turkish and English UI, light/dark theme.

## Features

- **Library**: search (accent-insensitive, e.g. `donusum` → *Dönüşüm*), status chips, filters by shelf / genre / author / publisher, list or grid view
- **Add books**: scan the ISBN barcode (details fetched from Open Library → Google Books), or add manually with inline creation of authors, publishers and genres
- **Book details**: start reading → finished (rating + note), change status, reading history
- **Lending**: lend to a person with a due date, mark as returned; **borrowed books** you have from others
- **Reminders**: overdue and soon-due loans / borrowed books
- **Goals**: weekly / monthly / yearly reading goals with progress and suggested pages per day
- **Statistics**: books and pages per year, monthly breakdown, pace, top authors and publishers
- **Wishlist**: books to buy, with "bought it → add to library"
- **Backup**: export the whole library as one JSON file (share sheet: Drive, email, Files) and import it back
- **Home-screen widget**: "Currently reading" (Android)

## What needs the internet?

Nothing, except looking up book details from a barcode and loading cover images for scanned books. Everything else works in airplane mode.

## Tech

| | |
|---|---|
| Framework | Expo SDK 58, React Native, TypeScript, Expo Router (file-based routes in `src/app`) |
| Data | `expo-sqlite` + `@tanstack/react-query` |
| UI | Custom theme tokens (`src/theme`), Ionicons, `react-native-svg` |
| Other | `expo-camera` (barcodes), `expo-widgets` (Android widget), `i18next` (TR/EN), `expo-file-system` + `expo-sharing` + `expo-document-picker` (backup) |

```
src/
  app/          screens (Expo Router): (tabs)/, book/[id], book/edit, scan, settings, ...
  api/hooks.ts  react-query hooks used by the screens
  db/           SQLite schema, migrations and repositories (business rules + statistics)
  lib/isbn.ts   barcode lookup (Open Library → Google Books)
  widgets/      "Currently reading" home-screen widget
  i18n/         Turkish and English strings
```

## Development

```bash
npm install
npx expo run:android      # development build on a connected device (USB or wireless debugging)
npx tsc --noEmit          # typecheck
npx expo lint             # lint
```

Expo Go is **not** enough: the app uses native modules (SQLite, widgets), so it needs a development or release build.

### Release build (standalone APK)

```bash
npx expo prebuild --platform android
cd android
./gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/release/app-release.apk
```

### Building on Windows

Some native libraries have very long C++ build paths. If the build fails with `ninja: error: mkdir(...): No such file or directory`:

1. Enable Windows long paths (admin PowerShell, then restart):
   `New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force`
2. Install CMake **3.31+** (Android Studio → SDK Manager → SDK Tools → CMake, or the official zip plus Ninja 1.12+ in its `bin`) and point the project at it in `android/local.properties`:
   ```
   cmake.dir=C\:/Users/<you>/AppData/Local/Android/Sdk/cmake/3.31.12
   ```
   `npx expo prebuild` can regenerate the `android/` folder, so re-add this line after it does.

## Moving data from the old web app

The companion Laravel backend has a command that exports the full library in this app's backup format:

```bash
php artisan library:export-mobile --user=<email-or-id>
```

Copy the resulting JSON to the phone and use **Settings → Import backup**.

## License

No license: all rights reserved.
