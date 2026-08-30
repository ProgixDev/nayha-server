# NAYHA database migrations

This folder is the authoritative, forward-only history for Supabase schema
changes made after 2026-08-30.

## Rules

1. Never edit or delete a migration that has been applied to a shared database.
2. Add each schema change as one timestamped file:
   `YYYYMMDDHHMMSS_short_description.sql`.
3. Use `supabase migration new short_description` to create new files.
4. Put development-only fixture data in `../seeds`, never in a production
   migration.

## One-time adoption

The legacy scripts in `../../sql` were applied manually and are retained as
historical reference; they are not ordered migrations. Before using this folder
against a new environment, install the Supabase CLI, link the project, and pull
the existing remote schema:

```bash
cd server
supabase init
supabase link --project-ref yskwdjaurwomsjpdgwgl
supabase db pull
```

Review the generated baseline before committing it. After the project is
linked, apply pending migrations with `supabase db push`.
