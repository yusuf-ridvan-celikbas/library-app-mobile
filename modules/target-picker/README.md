# target-picker

Android-only local module: the **Target** app's optional Lilies Lib extension.
Contract v1 is defined by Target (`docs/lilies-lib-contract.md` in the Target repo).

| Piece | What it does |
|---|---|
| `PickBookActivity` | answers `com.ridvan.target.action.PICK_BOOK`: lists the library, returns the tapped book (`book_id`, `title`, `author`, `page_count`, `publisher`, `published_year`) |
| `AddBookActivity` | answers `com.ridvan.target.action.ADD_BOOK`: shows the book Target sent, offers an existing book with the same title, adds it on confirm, returns `book_id` |
| `LibraryProvider` | `content://com.anonymous.eighteeneleven.target/books`, read-only, guarded by the dangerous permission `com.anonymous.eighteeneleven.permission.READ_LIBRARY` |
| `LiliesDb` | reads/writes the app's own `files/SQLite/eighteeneleven.db` the same way `src/db` does |

**Everything runs in the separate `:target` process.** The app opens the same file with
expo-sqlite, which bundles its own SQLite; two SQLite copies inside one process break each
other's file locks and can corrupt the database. Between processes normal SQLite (WAL) locking applies.

Books added from Target get status `available`. The published year is not stored, because the app keeps a full
date there. The app refreshes its lists when it comes to the foreground and the `books` table changed
(`useRefreshOnExternalChanges` in `src/app/_layout.tsx`).

Everything is declared in this module's `AndroidManifest.xml`, which Gradle merges into the app, so
`expo prebuild` keeps it. No network.
