import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirPerfil } from '@/lib/dados';

const ABAS = [
  { href: '/admin/base', rotulo: 'Base de conhecimento' },
  { href: '/admin/usuarios', rotulo: 'Usuários' },
  { href: '/admin/config', rotulo: 'Configurações' },
];

export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const perfil = await exigirPerfil();
  if (perfil.papel !== 'master') redirect('/chat');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-borda px-4 py-3">
        <nav className="mx-auto flex w-full max-w-5xl flex-wrap gap-1">
          {ABAS.map((aba) => (
            <Link
              key={aba.href}
              href={aba.href}
              className="rounded-md px-3 py-1.5 text-sm text-texto-suave transition-colors
                         hover:bg-superficie hover:text-texto"
            >
              {aba.rotulo}
            </Link>
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-6">{children}</div>
      </div>
    </div>
  );
}
