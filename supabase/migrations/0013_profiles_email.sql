alter table public.profiles add column email text;
create index idx_profiles_email on public.profiles(email);

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id;
