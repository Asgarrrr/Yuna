import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.SUPABASE_DATABASE_POOLER_URL;

if (!connectionString) {
  console.error("SUPABASE_DATABASE_POOLER_URL is not set");
  process.exit(1);
}

const client = postgres(connectionString, { prepare: false });
const db = drizzle(client);

async function clearGroceryData() {
  console.log("Clearing all grocery data...\n");

  // Order matters: clear child tables first, then parent tables
  const tables = [
    "product_tag",
    "purchase_history",
    "receipt_code_mapping",
    "inventory_item",
    "shopping_list_item",
    "shopping_list",
    "product",
  ];

  for (const table of tables) {
    const result = await db.execute(
      sql.raw(`DELETE FROM "${table}" RETURNING 1`),
    );
    console.log(`  ${table}: ${result.length} rows deleted`);
  }

  console.log("\nDone.");
}

clearGroceryData()
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(() => client.end());
