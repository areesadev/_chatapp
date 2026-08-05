'use client';

import { createBrowserClient } from '@supabase/ssr';

/** Cliente do browser. Só enxerga o que o RLS permitir para o usuário logado. */
export function criarClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
