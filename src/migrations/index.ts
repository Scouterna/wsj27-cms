import * as migration_20260830_200617_init from './20260830_200617_init';
import * as migration_20260922_232632_add_change_note from './20260922_232632_add_change_note';
import * as migration_20260923_103029_audience_publik from './20260923_103029_audience_publik';

export const migrations = [
  {
    up: migration_20260830_200617_init.up,
    down: migration_20260830_200617_init.down,
    name: '20260830_200617_init',
  },
  {
    up: migration_20260922_232632_add_change_note.up,
    down: migration_20260922_232632_add_change_note.down,
    name: '20260922_232632_add_change_note',
  },
  {
    up: migration_20260923_103029_audience_publik.up,
    down: migration_20260923_103029_audience_publik.down,
    name: '20260923_103029_audience_publik'
  },
];
