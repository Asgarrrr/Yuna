declare module "bun" {
  interface Env {
    SUPABASE_DATABASE_POOLER_URL: string;
    SUPABASE_DATABASE_DIRECT_URL: string;
    BETTER_AUTH_SECRET: string;
  }
}
