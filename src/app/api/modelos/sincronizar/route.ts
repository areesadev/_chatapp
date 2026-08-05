import { NextResponse } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { criarClienteAdmin, registrarAuditoria } from '@/lib/supabase/admin';

export const maxDuration = 60;

interface ModeloOpenRouter {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  top_provider?: { max_completion_tokens?: number | null };
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
}

/**
 * Importa o catálogo do OpenRouter para a tabela `modelos`.
 *
 * Os slugs do OpenRouter mudam com frequência (modelos gratuitos aparecem e
 * somem), então o catálogo é sincronizado sob demanda em vez de fixado nas
 * migrations. Modelos gratuitos entram desativados e sem acesso a documentos
 * confidenciais: quem libera é o master, cientes de que provedores gratuitos
 * costumam treinar com o conteúdo enviado.
 */
export async function POST() {
  const supabase = await criarClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { data: perfil } = await supabase
    .from('perfis')
    .select('papel, ativo')
    .eq('id', user.id)
    .maybeSingle();

  if (perfil?.papel !== 'master' || !perfil.ativo) {
    return NextResponse.json({ erro: 'Apenas o master pode sincronizar modelos.' }, { status: 403 });
  }

  const chave = process.env.OPENROUTER_API_KEY;
  if (!chave) {
    return NextResponse.json({ erro: 'OPENROUTER_API_KEY não configurada.' }, { status: 500 });
  }

  const resposta = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${chave}` },
  });

  if (!resposta.ok) {
    return NextResponse.json(
      { erro: `OpenRouter respondeu ${resposta.status} ao listar modelos.` },
      { status: 502 },
    );
  }

  const { data } = (await resposta.json()) as { data: ModeloOpenRouter[] };

  // Preserva o que o master já decidiu: um modelo ativado (ou liberado para
  // conteúdo confidencial) não pode ser revertido por uma ressincronização.
  const { data: jaCadastrados } = await supabase
    .from('modelos')
    .select('model_id, ativo, permite_confidencial, cadeia_de_modelos, nome_exibicao')
    .eq('provedor', 'openrouter');

  const decisoesAnteriores = new Map(
    (jaCadastrados ?? []).map((m) => [
      m.model_id,
      {
        ativo: m.ativo as boolean,
        permite_confidencial: m.permite_confidencial as boolean,
        cadeia_de_modelos: (m.cadeia_de_modelos as string[]) ?? [],
        nome_exibicao: m.nome_exibicao as string,
      },
    ]),
  );

  const linhas = data.map((m) => {
    const anterior = decisoesAnteriores.get(m.id);
    const entrada = Number(m.pricing?.prompt ?? 0);
    const saida = Number(m.pricing?.completion ?? 0);
    const gratuito = entrada === 0 && saida === 0;

    return {
      provedor: 'openrouter' as const,
      model_id: m.id,
      // Nome e cadeia de fallback podem ter sido configurados à mão; a
      // sincronização traz preço e contexto, não desfaz curadoria.
      nome_exibicao: anterior?.nome_exibicao ?? m.name ?? m.id,
      cadeia_de_modelos: anterior?.cadeia_de_modelos ?? [],
      descricao: m.description?.slice(0, 500) ?? null,
      gratuito,
      contexto: m.context_length ?? null,
      max_saida: Math.min(m.top_provider?.max_completion_tokens ?? 8192, 32000),
      // O OpenRouter cota preço por token; o catálogo interno usa 1M de tokens.
      custo_entrada_usd: Number((entrada * 1_000_000).toFixed(6)),
      custo_saida_usd: Number((saida * 1_000_000).toFixed(6)),
      permite_confidencial: anterior?.permite_confidencial ?? false,
      suporta_tools: m.supported_parameters?.includes('tools') ?? false,
      ativo: anterior?.ativo ?? false,
      ordem: gratuito ? 60 : 80,
    };
  });

  // Chave secreta: a sincronização mexe em linhas que o RLS de escrita do
  // master já permitiria, mas o upsert em lote é mais previsível fora do RLS.
  const admin = criarClienteAdmin();
  const { error } = await admin
    .from('modelos')
    .upsert(linhas, { onConflict: 'provedor,model_id', ignoreDuplicates: false });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  await registrarAuditoria({
    usuario_id: user.id,
    acao: 'modelos.sincronizar',
    entidade: 'modelos',
    detalhes: { total: linhas.length, gratuitos: linhas.filter((l) => l.gratuito).length },
  });

  return NextResponse.json({
    total: linhas.length,
    gratuitos: linhas.filter((l) => l.gratuito).length,
  });
}
