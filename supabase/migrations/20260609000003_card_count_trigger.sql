create or replace function update_card_count() returns trigger
language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update profiles set card_count = card_count + 1 where id = new.user_id;
  elsif tg_op = 'DELETE' then
    update profiles set card_count = greatest(card_count - 1, 0) where id = old.user_id;
  end if;
  return null;
end; $$;

create trigger cards_count_trigger
  after insert or delete on cards
  for each row execute function update_card_count();
