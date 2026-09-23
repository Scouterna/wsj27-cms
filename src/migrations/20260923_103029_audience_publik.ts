import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * `audience` keeps its meaning — who a page is for — but its answers change
 * from alla/ledare to publik/campfire, and `campfire` now also means "not on
 * the public handbook" (see handbok-data.ts).
 *
 * The UPDATEs are the part the generator cannot know to write. It swaps the
 * enum and casts the column back with `USING audience::enum_info_page_audience`,
 * and that cast fails on the first row it meets: every page in production holds
 * 'ledare', which is not a member of the new type. Moving the data across while
 * the column is still plain text is what keeps the deploy from failing at boot,
 * with the image already rolling.
 *
 * Everything becomes 'publik'. Nothing is hidden by a migration — a page leaves
 * the public handbook because an editor chose that, not because it was
 * converted.
 *
 * `down` is lossy on purpose: the old value cannot be recovered per row, and
 * every page held 'ledare'.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "info_page" ALTER COLUMN "audience" SET DATA TYPE text;
  UPDATE "info_page" SET "audience" = 'publik';
  ALTER TABLE "info_page" ALTER COLUMN "audience" SET DEFAULT 'publik'::text;
  DROP TYPE "public"."enum_info_page_audience";
  CREATE TYPE "public"."enum_info_page_audience" AS ENUM('publik', 'campfire');
  ALTER TABLE "info_page" ALTER COLUMN "audience" SET DEFAULT 'publik'::"public"."enum_info_page_audience";
  ALTER TABLE "info_page" ALTER COLUMN "audience" SET DATA TYPE "public"."enum_info_page_audience" USING "audience"::"public"."enum_info_page_audience";
  ALTER TABLE "_info_page_v" ALTER COLUMN "version_audience" SET DATA TYPE text;
  UPDATE "_info_page_v" SET "version_audience" = 'publik';
  ALTER TABLE "_info_page_v" ALTER COLUMN "version_audience" SET DEFAULT 'publik'::text;
  DROP TYPE "public"."enum__info_page_v_version_audience";
  CREATE TYPE "public"."enum__info_page_v_version_audience" AS ENUM('publik', 'campfire');
  ALTER TABLE "_info_page_v" ALTER COLUMN "version_audience" SET DEFAULT 'publik'::"public"."enum__info_page_v_version_audience";
  ALTER TABLE "_info_page_v" ALTER COLUMN "version_audience" SET DATA TYPE "public"."enum__info_page_v_version_audience" USING "version_audience"::"public"."enum__info_page_v_version_audience";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "info_page" ALTER COLUMN "audience" SET DATA TYPE text;
  UPDATE "info_page" SET "audience" = 'ledare';
  ALTER TABLE "info_page" ALTER COLUMN "audience" SET DEFAULT 'alla'::text;
  DROP TYPE "public"."enum_info_page_audience";
  CREATE TYPE "public"."enum_info_page_audience" AS ENUM('alla', 'ledare');
  ALTER TABLE "info_page" ALTER COLUMN "audience" SET DEFAULT 'alla'::"public"."enum_info_page_audience";
  ALTER TABLE "info_page" ALTER COLUMN "audience" SET DATA TYPE "public"."enum_info_page_audience" USING "audience"::"public"."enum_info_page_audience";
  ALTER TABLE "_info_page_v" ALTER COLUMN "version_audience" SET DATA TYPE text;
  UPDATE "_info_page_v" SET "version_audience" = 'ledare';
  ALTER TABLE "_info_page_v" ALTER COLUMN "version_audience" SET DEFAULT 'alla'::text;
  DROP TYPE "public"."enum__info_page_v_version_audience";
  CREATE TYPE "public"."enum__info_page_v_version_audience" AS ENUM('alla', 'ledare');
  ALTER TABLE "_info_page_v" ALTER COLUMN "version_audience" SET DEFAULT 'alla'::"public"."enum__info_page_v_version_audience";
  ALTER TABLE "_info_page_v" ALTER COLUMN "version_audience" SET DATA TYPE "public"."enum__info_page_v_version_audience" USING "version_audience"::"public"."enum__info_page_v_version_audience";`)
}
