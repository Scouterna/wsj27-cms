import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * `position` is chapter order × 1000 + page order: the one sortable number that
 * expresses book order, because the admin list sorts on a single column and
 * `order` restarts at zero in every chapter.
 *
 * The backfill is here rather than in a script so production is correct the
 * moment it boots, and it is SQL rather than a re-save so that no page gets a
 * new `updatedAt` — that date is reader-facing on /handbok, and forty-two pages
 * claiming to have changed today would be a lie told by a schema change.
 *
 * The 1000 is also in `src/fields/position.ts`, which owns it from here on.
 * This is a one-off snapshot of what that function computes; if the two ever
 * disagree, the function is right.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "info_page" ADD COLUMN "position" numeric;
  ALTER TABLE "_info_page_v" ADD COLUMN "version_position" numeric;
  UPDATE "info_page" p SET "position" = c."order" * 1000 + p."order"
    FROM "info_chapter" c WHERE c.id = p.chapter_id;
  UPDATE "_info_page_v" v SET "version_position" = c."order" * 1000 + v."version_order"
    FROM "info_chapter" c WHERE c.id = v.version_chapter_id;
  CREATE INDEX "info_page_position_idx" ON "info_page" USING btree ("position");
  CREATE INDEX "_info_page_v_version_version_position_idx" ON "_info_page_v" USING btree ("version_position");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "info_page_position_idx";
  DROP INDEX "_info_page_v_version_version_position_idx";
  ALTER TABLE "info_page" DROP COLUMN "position";
  ALTER TABLE "_info_page_v" DROP COLUMN "version_position";`)
}
