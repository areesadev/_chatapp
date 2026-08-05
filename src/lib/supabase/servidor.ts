import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Cliente de servidor autenticado pelo cookie da sessão.
 * Continua sujeito ao RLS — é o cliente padrão de Server Components e rotas.
 */
export async function criarClienteServidor() {
  const armazenamento = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => armazenamento.getAll(),
        setAll: (cookiesParaDefinir) => {
          try {
            for (const { name, value, options } of cookiesParaDefinir) {
              armazenamento.set(name, value, options);
            }
          } catch {
            // Server Component não pode escrever cookies; o middleware já
            // renova a sessão a cada request, então isso é seguro de ignorar.
          }
        },
      },
    },
  );
}
