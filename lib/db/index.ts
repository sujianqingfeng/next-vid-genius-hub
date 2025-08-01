import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import { DATABASE_URL } from "../constants";

if (!DATABASE_URL) {
	throw new Error("DATABASE_URL is missing");
}

const client = createClient({
	url: DATABASE_URL,
});

const db = drizzle(client, { schema });

export { schema, db };
