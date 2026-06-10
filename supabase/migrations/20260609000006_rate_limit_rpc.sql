create or replace function rate_limit_increment(
  p_user_id uuid,
  p_day date,
  p_field text,
  p_amount int
) returns int
language plpgsql security definer as $$
declare
  v_value int;
begin
  insert into rate_limits (user_id, day) values (p_user_id, p_day)
    on conflict do nothing;

  if p_field = 'outlines_today' then
    update rate_limits set outlines_today = outlines_today + p_amount
      where user_id = p_user_id and day = p_day
      returning outlines_today into v_value;
  elsif p_field = 'cards_today' then
    update rate_limits set cards_today = cards_today + p_amount
      where user_id = p_user_id and day = p_day
      returning cards_today into v_value;
  else
    raise exception 'unknown field %', p_field;
  end if;

  return v_value;
end; $$;
