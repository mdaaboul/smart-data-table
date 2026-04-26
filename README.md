# @wavatec/smart-data-table

Reusable data table component for Wavatec apps. Sort, filter, search, multi-row selection, column popup, cell context menu, footer aggregations. Built on top of `@tanstack/react-table`. i18n-ready.

> Table view only. Card and Kanban views are intentionally **not** part of this package — those belong in app-level adapters when needed.

## Install

```bash
# Once stable / tagged:
npm i github:mdaaboul/smart-data-table#v0.1.0

# During active iteration (local file link):
npm i file:../wavatec-smart-table
```

## Peer dependencies

You must have these installed in the consuming app:

- `react` >=18
- `react-dom` >=18
- `react-i18next` >=14
- `@tanstack/react-table` >=8.20
- `lucide-react` >=0.450
- `clsx` >=2
- `date-fns` >=3
- `file-saver` >=2
- `xlsx` >=0.18

## Tailwind setup (consumer)

Add the package to your `tailwind.config` `content` array so Tailwind picks up the class names used in the package source:

```js
content: [
  './src/**/*.{ts,tsx}',
  './node_modules/@wavatec/smart-data-table/dist/**/*.{js,mjs}',
],
```

## i18n setup (consumer)

The package ships English and French translation packs under the `smartTable.*` namespace:

```ts
import en from '@wavatec/smart-data-table/locales/en.json';
import fr from '@wavatec/smart-data-table/locales/fr.json';

i18n.addResourceBundle('en', 'common', { smartTable: en }, true, true);
i18n.addResourceBundle('fr', 'common', { smartTable: fr }, true, true);
```

## PrefsAPI

The component takes a `prefs` prop you implement once per app. It abstracts column visibility / pagination / view-state persistence so the package never touches `localStorage` directly:

```ts
interface PrefsAPI {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}
```

A `localStorage`-backed default helper is exported as `createLocalStoragePrefs()`.

## Usage

```tsx
import { SmartDataTable, type SmartColumn } from '@wavatec/smart-data-table';

const columns: SmartColumn<User>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name' },
  { id: 'role', header: 'Role', accessorKey: 'role' },
];

<SmartDataTable
  data={users}
  columns={columns}
  prefs={prefs}
  enableSelection
  selectionActions={[
    { label: 'Archive', onClick: (rows) => archive(rows) },
  ]}
/>
```

See `src/types.ts` for the full props surface.

## Development

```bash
npm install
npm run dev      # tsup --watch
npm run build    # tsup
npm run typecheck
```
