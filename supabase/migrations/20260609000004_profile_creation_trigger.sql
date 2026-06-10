create or replace function create_profile_for_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end; $$;

create trigger profile_creation_trigger
  after insert on auth.users
  for each row execute function create_profile_for_new_user();
