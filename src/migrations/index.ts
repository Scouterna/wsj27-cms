import * as migration_20260830_200617_init from './20260830_200617_init';
import * as migration_20260922_232632_add_change_note from './20260922_232632_add_change_note';

export const migrations = [
  {
    up: migration_20260830_200617_init.up,
    down: migration_20260830_200617_init.down,
    name: '20260830_200617_init',
  },
  {
    up: migration_20260922_232632_add_change_note.up,
    down: migration_20260922_232632_add_change_note.down,
    name: '20260922_232632_add_change_note'
  },
];
