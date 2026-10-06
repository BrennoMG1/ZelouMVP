-- Dados fictícios para demonstração local. Não use em produção.
insert into public.profiles (id, role, full_name, city, state) values
  ('00000000-0000-0000-0000-000000000001', 'caregiver', 'Cuidador demonstrativo', 'São Paulo', 'SP'),
  ('00000000-0000-0000-0000-000000000002', 'client', 'Família Silva', 'São Paulo', 'SP');
insert into public.caregiver_profiles (user_id, bio, experience_years, specialties, hourly_rate, verification_status, rating, completed_contracts) values
  ('00000000-0000-0000-0000-000000000001', 'Cuidado atento e companhia para uma rotina mais leve.', 6, '{Companhia,Rotina}', 32, 'approved', 4.9, 18);
insert into public.opportunities (id, client_id, title, description, care_type, approximate_region, schedule, hourly_rate, status) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000002', 'Acompanhamento durante o período da manhã', 'Apoio e companhia em rotina leve.', 'Acompanhamento', 'Vila Mariana, São Paulo', '{"days":"Seg a sex","hours":"08:00 - 13:00"}', 32, 'published');
