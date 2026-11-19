# target-picker

Android-only local module: lets the **Target** app pick a book from Lilies Lib.

Contract v1 is defined by Target (`docs/lilies-lib-contract.md` in the Target repo):

- Target starts `com.ridvan.target.action.PICK_BOOK` (explicit package
  `com.anonymous.eighteeneleven`) for a result, with extra `contract_version`.
- `PickBookActivity` lists the books from the app's own SQLite file
  (`files/SQLite/eighteeneleven.db`, opened **read-only**) and answers with
  `RESULT_OK` + `contract_version`, `book_id`, `title`, `author`, `page_count`,
  `publisher`, `published_year`, or `RESULT_CANCELED` on back.

The activity is declared in this module's `AndroidManifest.xml`, which Gradle
merges into the app, so no config plugin is needed and `expo prebuild` keeps it.
No network, no new permissions.
