import { defineConfig } from "drizzle-kit";
import { DATABASE_URL } from "./lib/constants";

if (!DATABASE_URL) {
	throw new Error("DATABASE_URL is not set in .env file");
}

export default defineConfig({
	schema: "./lib/db/schema.ts",
	out: "./drizzle",
	dialect: "sqlite",
	dbCredentials: {
		url: DATABASE_URL,
	},
     	verbose: true,
	strict: true,
})



