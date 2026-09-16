-- Run once using Supabase's SQL editor. No anonymous access or client writes.
create table public.dialed_workspaces (id uuid primary key default gen_random_uuid(), name text not null, revision bigint not null default 0);
create table public.dialed_members (workspace_id uuid not null references public.dialed_workspaces(id), user_id uuid not null references auth.users(id), primary key(workspace_id,user_id));
create table public.dialed_records (workspace_id uuid not null references public.dialed_workspaces(id), collection text not null check(collection in ('entities','files','keys','meta')), key text not null, payload jsonb not null, ordinal bigint generated always as identity, primary key(workspace_id,collection,key));
alter table public.dialed_workspaces enable row level security;
alter table public.dialed_members enable row level security;
alter table public.dialed_records enable row level security;
create policy own_membership on public.dialed_members for select to authenticated using(user_id=auth.uid());
create policy member_workspace on public.dialed_workspaces for select to authenticated using(exists(select 1 from public.dialed_members m where m.workspace_id=id and m.user_id=auth.uid()));
create policy member_records on public.dialed_records for select to authenticated using(exists(select 1 from public.dialed_members m where m.workspace_id=dialed_records.workspace_id and m.user_id=auth.uid()));
revoke all on public.dialed_workspaces,public.dialed_members,public.dialed_records from anon,authenticated;
grant select on public.dialed_workspaces,public.dialed_members,public.dialed_records to authenticated;
create function public.dialed_snapshot(workspace uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; category text; rows jsonb;
begin
 if not exists(select 1 from public.dialed_members where workspace_id=workspace and user_id=auth.uid()) then raise exception 'Not a member' using errcode='42501'; end if;
 select jsonb_build_object('revision',revision) into result from public.dialed_workspaces where id=workspace;
 foreach category in array array['entities','files','keys','meta'] loop
 select coalesce(jsonb_agg(payload order by ordinal),'[]'::jsonb) into rows from public.dialed_records where workspace_id=workspace and collection=category;
 result=result||jsonb_build_object(category,rows);
 end loop;
 return result;
end $$;
create function public.dialed_commit(workspace uuid,actor uuid,expected_revision bigint,delta jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_revision bigint; category text; entry jsonb; row_key text;
begin
 if not exists(select 1 from public.dialed_members where workspace_id=workspace and user_id=actor) then raise exception 'Not a member' using errcode='42501'; end if;
 select revision into current_revision from public.dialed_workspaces where id=workspace for update;
 if current_revision is distinct from expected_revision then raise exception 'Revision conflict' using errcode='40001'; end if;
 foreach category in array array['entities','files','keys','meta'] loop
  delete from public.dialed_records where workspace_id=workspace and collection=category and key in(select jsonb_array_elements_text(delta->category->'delete'));
  for entry in select jsonb_array_elements(delta->category->'upsert') loop
   row_key=entry->>(case when category in ('entities','files') then 'id' else 'key' end);
   insert into public.dialed_records(workspace_id,collection,key,payload) values(workspace,category,row_key,entry) on conflict(workspace_id,collection,key) do update set payload=excluded.payload;
  end loop;
 end loop;
 update public.dialed_workspaces set revision=revision+1 where id=workspace;
 return jsonb_build_object('revision',current_revision+1);
end $$;
revoke all on function public.dialed_snapshot(uuid) from public,anon;
grant execute on function public.dialed_snapshot(uuid) to authenticated;
revoke all on function public.dialed_commit(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.dialed_commit(uuid,uuid,bigint,jsonb) to service_role;

grant select on public.dialed_workspaces,public.dialed_members,public.dialed_records to service_role;
