-- Células de exemplo em bairros de Cabreúva (coordenadas do OpenStreetMap).
-- Troque ou apague pelo painel /admin → Células.

with novas as (
  insert into public.celulas
    (nome, perfil, lider_nome, dia_semana, horario, bairro, descricao, latitude, longitude, publicado)
  values
    ('Célula Novo Bonfim (exemplo)', 'mista', 'Líder a definir', 2, '20:00', 'Novo Bonfim',
     'Louvor, estudo da Palavra e um café no final.', -23.280384, -47.061301, true),
    ('Célula Jovem Jacaré (exemplo)', 'jovens', 'Líder a definir', 5, '20:00', 'Jacaré',
     'Para quem tem de 15 a 29 anos.', -23.264494, -47.045017, true),
    ('Célula de Casais Centro (exemplo)', 'casais', 'Líder a definir', 4, '20:00', 'Centro',
     'Encontro quinzenal para casais, com jantar partilhado.', -23.307336, -47.132909, true),
    ('Célula de Mulheres Pinhal (exemplo)', 'mulheres', 'Líder a definir', 3, '15:00', 'São Francisco do Pinhal',
     'Oração e estudo durante a tarde.', -23.254694, -47.095213, true),
    ('Célula Bananal (exemplo)', 'mista', 'Líder a definir', 1, '19:30', 'Bananal',
     'Aberta a toda a família, com espaço para as crianças.', -23.352392, -47.083060, true)
  returning id
)
insert into public.celulas_enderecos (celula_id, endereco)
select id, 'Endereço de exemplo — troque pelo endereço real' from novas;
