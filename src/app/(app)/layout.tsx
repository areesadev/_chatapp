import { BarraLateral } from '@/components/barra-lateral';
import { consumoDoMes, exigirPerfil, listarConversas } from '@/lib/dados';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const perfil = await exigirPerfil();
  const [conversas, gastoDoMes] = await Promise.all([
    listarConversas(),
    consumoDoMes(perfil.id),
  ]);

  return (
    <div className="flex h-screen flex-col md:flex-row">
      <BarraLateral perfil={perfil} conversas={conversas} gastoDoMes={gastoDoMes} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
