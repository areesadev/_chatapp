import { Marca } from '@/components/marca';
import { FormularioLogin } from './formulario-login';

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string; erro?: string }>;
}) {
  const { destino, erro } = await searchParams;
  // Aceita apenas caminho interno — evita redirect aberto para domínio externo.
  const destinoSeguro = destino?.startsWith('/') && !destino.startsWith('//') ? destino : '/chat';

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2">
          <Marca tamanho="grande" />
          <p className="text-sm text-texto-suave">
            Diretor de Operações da Areesa. Acesso restrito a sócios, diretores e
            colaboradores da agência.
          </p>
        </div>

        {erro && (
          <p role="alert" className="rounded-lg border border-borda bg-superficie px-3 py-2.5 text-sm text-alerta">
            {erro}
          </p>
        )}

        <FormularioLogin destino={destinoSeguro} />
      </div>
    </main>
  );
}
