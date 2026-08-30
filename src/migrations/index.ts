import * as migration_20260830_200617_init from './20260830_200617_init';

export const migrations = [
  {
    up: migration_20260830_200617_init.up,
    down: migration_20260830_200617_init.down,
    name: '20260830_200617_init'
  },
];
