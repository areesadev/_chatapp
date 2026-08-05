import { Marca } from '@/components/marca';

export default function AcessoPendente() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <Marca tamanho="grande" />

        <div className="space-y-3">
          <h1 className="text-lg font-medium">Acesso ainda não liberado</h1>
          <p className="text-sm text-texto-suave">
            Seu login funcionou, mas este e-mail ainda não foi autorizado a usar o
            Areesa _cerebro. O administrador da agência precisa cadastrar o seu acesso.
          </p>
          <p className="text-sm text-texto-suave">
            Assim que isso for feito, basta entrar de novo — não é preciso criar
            nada.
          </p>
        </div>

        <a
          href="/login"
          className="inline-block text-sm underline underline-offset-2 text-texto-suave hover:text-texto"
        >
          Voltar ao login
        </a>
      </div>
    </main>
  );
}
