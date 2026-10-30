begin;

select plan(9);

select ok(
  (select count(*) = 6 and bool_and(c.relrowsecurity)
   from pg_class as c
   join pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname::text = any (array['sources', 'parties', 'institutions', 'politicians', 'mandates', 'update_records'])),
  'RLS is enabled on every political data table'
);

select ok(
  (select bool_and(has_table_privilege('anon', format('public.%I', table_name), 'SELECT'))
   from unnest(array['sources', 'parties', 'institutions', 'politicians', 'mandates', 'update_records']) as t(table_name)),
  'anonymous visitors can read public political data'
);

select ok(
  (select bool_and(has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT'))
   from unnest(array['sources', 'parties', 'institutions', 'politicians', 'mandates', 'update_records']) as t(table_name)),
  'authenticated users can read public political data'
);

select ok(
  (select not bool_or(has_table_privilege('anon', format('public.%I', table_name), 'INSERT'))
   from unnest(array['sources', 'parties', 'institutions', 'politicians', 'mandates', 'update_records']) as t(table_name)),
  'anonymous visitors cannot insert political data'
);

select ok(
  (select not bool_or(has_table_privilege('anon', format('public.%I', table_name), 'UPDATE'))
   from unnest(array['sources', 'parties', 'institutions', 'politicians', 'mandates', 'update_records']) as t(table_name)),
  'anonymous visitors cannot update political data'
);

select ok(
  (select not bool_or(has_table_privilege('anon', format('public.%I', table_name), 'DELETE'))
   from unnest(array['sources', 'parties', 'institutions', 'politicians', 'mandates', 'update_records']) as t(table_name)),
  'anonymous visitors cannot delete political data'
);

select ok(
  (select not bool_or(has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT'))
   from unnest(array['sources', 'parties', 'institutions', 'politicians', 'mandates', 'update_records']) as t(table_name)),
  'authenticated users cannot insert political data'
);

select ok(
  (select not bool_or(has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE'))
   from unnest(array['sources', 'parties', 'institutions', 'politicians', 'mandates', 'update_records']) as t(table_name)),
  'authenticated users cannot update political data'
);

select ok(
  (select not bool_or(has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE'))
   from unnest(array['sources', 'parties', 'institutions', 'politicians', 'mandates', 'update_records']) as t(table_name)),
  'authenticated users cannot delete political data'
);

select * from finish();
rollback;
