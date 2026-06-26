-- Optional: a read-only function that lets `npm run db:schema` capture FULL
-- schema fidelity (exact Postgres types, column defaults, PK/FK flags) instead
-- of the zero-setup PostgREST OpenAPI fallback.
--
-- Safe: read-only, returns only public-schema metadata (no row data). Run this
-- once in the Supabase SQL editor, then re-run `npm run db:schema`.

create or replace function public.schema_catalog()
returns table (
  table_name      text,
  column_name     text,
  ordinal_position int,
  data_type       text,
  is_nullable     text,
  column_default  text,
  is_primary_key  boolean,
  foreign_key     text
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    c.table_name::text,
    c.column_name::text,
    c.ordinal_position::int,
    coalesce(
      case when c.data_type = 'USER-DEFINED' then c.udt_name else c.data_type end,
      c.data_type
    )::text as data_type,
    c.is_nullable::text,
    c.column_default::text,
    (pk.column_name is not null) as is_primary_key,
    fk.ref as foreign_key
  from information_schema.columns c
  left join (
    select kcu.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public'
  ) pk on pk.table_name = c.table_name and pk.column_name = c.column_name
  left join (
    select kcu.table_name, kcu.column_name,
           (ccu.table_name || '.' || ccu.column_name) as ref
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
  ) fk on fk.table_name = c.table_name and fk.column_name = c.column_name
  where c.table_schema = 'public'
  order by c.table_name, c.ordinal_position;
$$;

-- Allow the service role (used by the dump script) to call it.
grant execute on function public.schema_catalog() to service_role;
