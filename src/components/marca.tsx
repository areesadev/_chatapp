export function Marca({ tamanho = 'normal' }: { tamanho?: 'normal' | 'grande' }) {
  const escala = tamanho === 'grande' ? 'text-2xl' : 'text-base';

  return (
    <span className={`${escala} font-semibold tracking-tight select-none`}>
      Areesa <span className="text-texto-tenue font-normal">_cerebro</span>
    </span>
  );
}
