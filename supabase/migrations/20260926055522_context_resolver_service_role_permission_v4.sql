grant usage on schema private to service_role;
revoke all on function private.build_context_websearch_query_v1(text) from public, anon, authenticated;
grant execute on function private.build_context_websearch_query_v1(text) to service_role;
