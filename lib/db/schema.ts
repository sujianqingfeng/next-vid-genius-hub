import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const videos = sqliteTable("videos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  url: text("url").notNull().unique(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
