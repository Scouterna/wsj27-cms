import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('sv', 'en');
  CREATE TYPE "public"."enum_users_roles" AS ENUM('admin', 'editor');
  CREATE TYPE "public"."enum_info_page_audience" AS ENUM('alla', 'ledare');
  CREATE TYPE "public"."enum_info_page_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__info_page_v_version_audience" AS ENUM('alla', 'ledare');
  CREATE TYPE "public"."enum__info_page_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__info_page_v_published_locale" AS ENUM('sv', 'en');
  CREATE TABLE "users_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"sub" varchar NOT NULL,
  	"email" varchar,
  	"name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_sm_url" varchar,
  	"sizes_sm_width" numeric,
  	"sizes_sm_height" numeric,
  	"sizes_sm_mime_type" varchar,
  	"sizes_sm_filesize" numeric,
  	"sizes_sm_filename" varchar,
  	"sizes_md_url" varchar,
  	"sizes_md_width" numeric,
  	"sizes_md_height" numeric,
  	"sizes_md_mime_type" varchar,
  	"sizes_md_filesize" numeric,
  	"sizes_md_filename" varchar,
  	"sizes_lg_url" varchar,
  	"sizes_lg_width" numeric,
  	"sizes_lg_height" numeric,
  	"sizes_lg_mime_type" varchar,
  	"sizes_lg_filesize" numeric,
  	"sizes_lg_filename" varchar
  );
  
  CREATE TABLE "media_locales" (
  	"alt" varchar NOT NULL,
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "info_page" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"chapter_id" integer,
  	"order" numeric DEFAULT 0,
  	"audience" "enum_info_page_audience" DEFAULT 'alla',
  	"icon" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_info_page_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "info_page_locales" (
  	"title" varchar,
  	"content" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_info_page_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_chapter_id" integer,
  	"version_order" numeric DEFAULT 0,
  	"version_audience" "enum__info_page_v_version_audience" DEFAULT 'alla',
  	"version_icon" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__info_page_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__info_page_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_info_page_v_locales" (
  	"version_title" varchar,
  	"version_content" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "info_chapter" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"order" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "info_chapter_locales" (
  	"name" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "search" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"priority" numeric,
  	"search_text" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "search_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"info_page_id" integer
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"info_page_id" integer,
  	"info_chapter_id" integer,
  	"search_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_locales" ADD CONSTRAINT "media_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "info_page" ADD CONSTRAINT "info_page_chapter_id_info_chapter_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."info_chapter"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "info_page_locales" ADD CONSTRAINT "info_page_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."info_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_info_page_v" ADD CONSTRAINT "_info_page_v_parent_id_info_page_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."info_page"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_info_page_v" ADD CONSTRAINT "_info_page_v_version_chapter_id_info_chapter_id_fk" FOREIGN KEY ("version_chapter_id") REFERENCES "public"."info_chapter"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_info_page_v_locales" ADD CONSTRAINT "_info_page_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_info_page_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "info_chapter_locales" ADD CONSTRAINT "info_chapter_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."info_chapter"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "search_rels" ADD CONSTRAINT "search_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."search"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "search_rels" ADD CONSTRAINT "search_rels_info_page_fk" FOREIGN KEY ("info_page_id") REFERENCES "public"."info_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_info_page_fk" FOREIGN KEY ("info_page_id") REFERENCES "public"."info_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_info_chapter_fk" FOREIGN KEY ("info_chapter_id") REFERENCES "public"."info_chapter"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_search_fk" FOREIGN KEY ("search_id") REFERENCES "public"."search"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_roles_order_idx" ON "users_roles" USING btree ("order");
  CREATE INDEX "users_roles_parent_idx" ON "users_roles" USING btree ("parent_id");
  CREATE UNIQUE INDEX "users_sub_idx" ON "users" USING btree ("sub");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_sm_sizes_sm_filename_idx" ON "media" USING btree ("sizes_sm_filename");
  CREATE INDEX "media_sizes_md_sizes_md_filename_idx" ON "media" USING btree ("sizes_md_filename");
  CREATE INDEX "media_sizes_lg_sizes_lg_filename_idx" ON "media" USING btree ("sizes_lg_filename");
  CREATE UNIQUE INDEX "media_locales_locale_parent_id_unique" ON "media_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "info_page_slug_idx" ON "info_page" USING btree ("slug");
  CREATE INDEX "info_page_chapter_idx" ON "info_page" USING btree ("chapter_id");
  CREATE INDEX "info_page_updated_at_idx" ON "info_page" USING btree ("updated_at");
  CREATE INDEX "info_page_created_at_idx" ON "info_page" USING btree ("created_at");
  CREATE INDEX "info_page__status_idx" ON "info_page" USING btree ("_status");
  CREATE UNIQUE INDEX "info_page_locales_locale_parent_id_unique" ON "info_page_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_info_page_v_parent_idx" ON "_info_page_v" USING btree ("parent_id");
  CREATE INDEX "_info_page_v_version_version_slug_idx" ON "_info_page_v" USING btree ("version_slug");
  CREATE INDEX "_info_page_v_version_version_chapter_idx" ON "_info_page_v" USING btree ("version_chapter_id");
  CREATE INDEX "_info_page_v_version_version_updated_at_idx" ON "_info_page_v" USING btree ("version_updated_at");
  CREATE INDEX "_info_page_v_version_version_created_at_idx" ON "_info_page_v" USING btree ("version_created_at");
  CREATE INDEX "_info_page_v_version_version__status_idx" ON "_info_page_v" USING btree ("version__status");
  CREATE INDEX "_info_page_v_created_at_idx" ON "_info_page_v" USING btree ("created_at");
  CREATE INDEX "_info_page_v_updated_at_idx" ON "_info_page_v" USING btree ("updated_at");
  CREATE INDEX "_info_page_v_snapshot_idx" ON "_info_page_v" USING btree ("snapshot");
  CREATE INDEX "_info_page_v_published_locale_idx" ON "_info_page_v" USING btree ("published_locale");
  CREATE INDEX "_info_page_v_latest_idx" ON "_info_page_v" USING btree ("latest");
  CREATE UNIQUE INDEX "_info_page_v_locales_locale_parent_id_unique" ON "_info_page_v_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "info_chapter_slug_idx" ON "info_chapter" USING btree ("slug");
  CREATE INDEX "info_chapter_updated_at_idx" ON "info_chapter" USING btree ("updated_at");
  CREATE INDEX "info_chapter_created_at_idx" ON "info_chapter" USING btree ("created_at");
  CREATE UNIQUE INDEX "info_chapter_locales_locale_parent_id_unique" ON "info_chapter_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "search_updated_at_idx" ON "search" USING btree ("updated_at");
  CREATE INDEX "search_created_at_idx" ON "search" USING btree ("created_at");
  CREATE INDEX "search_rels_order_idx" ON "search_rels" USING btree ("order");
  CREATE INDEX "search_rels_parent_idx" ON "search_rels" USING btree ("parent_id");
  CREATE INDEX "search_rels_path_idx" ON "search_rels" USING btree ("path");
  CREATE INDEX "search_rels_info_page_id_idx" ON "search_rels" USING btree ("info_page_id");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_info_page_id_idx" ON "payload_locked_documents_rels" USING btree ("info_page_id");
  CREATE INDEX "payload_locked_documents_rels_info_chapter_id_idx" ON "payload_locked_documents_rels" USING btree ("info_chapter_id");
  CREATE INDEX "payload_locked_documents_rels_search_id_idx" ON "payload_locked_documents_rels" USING btree ("search_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_roles" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "media_locales" CASCADE;
  DROP TABLE "info_page" CASCADE;
  DROP TABLE "info_page_locales" CASCADE;
  DROP TABLE "_info_page_v" CASCADE;
  DROP TABLE "_info_page_v_locales" CASCADE;
  DROP TABLE "info_chapter" CASCADE;
  DROP TABLE "info_chapter_locales" CASCADE;
  DROP TABLE "search" CASCADE;
  DROP TABLE "search_rels" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."_locales";
  DROP TYPE "public"."enum_users_roles";
  DROP TYPE "public"."enum_info_page_audience";
  DROP TYPE "public"."enum_info_page_status";
  DROP TYPE "public"."enum__info_page_v_version_audience";
  DROP TYPE "public"."enum__info_page_v_version_status";
  DROP TYPE "public"."enum__info_page_v_published_locale";`)
}
