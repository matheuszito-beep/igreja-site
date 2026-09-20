-- ============================================================
-- Mural de oração — anônimo por padrão
--
-- Camada nova, pública: além de continuar indo pro WhatsApp da equipe (sem mudança),
-- quem quiser pode marcar pra também aparecer no carrossel público do site, sem nome
-- a não ser que confirme explicitamente que quer mostrar.
-- ============================================================

create table public.pedidos_oracao (
  id uuid primary key default gen_random_uuid(),
  pedido text not null check (char_length(btrim(pedido)) between 10 and 800),
  nome text check (nome is null or char_length(btrim(nome)) between 1 and 80),
  mostrar_nome boolean not null default false,
  criado_em timestamptz not null default now()
);

create index pedidos_oracao_criado_em_idx on public.pedidos_oracao (criado_em desc);

-- Nunca guarda o nome sem autorização explícita, mesmo que alguém tente forçar via API.
create or replace function interno.proteger_pedido_oracao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.mostrar_nome then
    new.nome := null;
  end if;
  return new;
end;
$$;

create trigger pedidos_oracao_proteger
  before insert or update on public.pedidos_oracao
  for each row execute function interno.proteger_pedido_oracao();

alter table public.pedidos_oracao enable row level security;

revoke update, delete on public.pedidos_oracao from anon;

create policy "Mural de oração é público"
  on public.pedidos_oracao for select to anon, authenticated
  using (true);

create policy "Qualquer um publica no mural"
  on public.pedidos_oracao for insert to anon, authenticated
  with check (true);

create policy "Editores moderam o mural"
  on public.pedidos_oracao for delete to authenticated
  using ((select interno.papel_atual()) in ('editor', 'admin'));
