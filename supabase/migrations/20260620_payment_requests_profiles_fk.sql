-- PostgREST cannot resolve payment_requests → profiles via transitive auth.users.
-- Add a redundant FK so the embedded resource join `profiles(...)` works in admin.html.
-- Safe: every payment_requests.user_id is already a valid auth.users(id), and every
-- profiles.id equals an auth.users(id), so the new constraint is always satisfied.

alter table public.payment_requests
  add constraint payment_requests_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

notify pgrst, 'reload schema';
