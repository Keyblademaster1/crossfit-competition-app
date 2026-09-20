import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js keeps local secrets in .env.local, but the Prisma CLI does not know
// about that file, so load it explicitly. This keeps the database password in
// exactly one place.
config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
