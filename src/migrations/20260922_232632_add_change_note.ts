import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "info_page" ADD COLUMN "change_note_at" timestamp(3) with time zone;
  ALTER TABLE "info_page_locales" ADD COLUMN "change_note" varchar;
  ALTER TABLE "_info_page_v" ADD COLUMN "version_change_note_at" timestamp(3) with time zone;
  ALTER TABLE "_info_page_v_locales" ADD COLUMN "version_change_note" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "info_page" DROP COLUMN "change_note_at";
  ALTER TABLE "info_page_locales" DROP COLUMN "change_note";
  ALTER TABLE "_info_page_v" DROP COLUMN "version_change_note_at";
  ALTER TABLE "_info_page_v_locales" DROP COLUMN "version_change_note";`)
}
