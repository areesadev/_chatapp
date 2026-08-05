import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';

// Auto-hospedada pelo Next: sem requisição a servidor do Google em runtime e
// sem salto de layout na troca da fonte de fallback pela definitiva.
const outfit = Outfit({
  subsets: ['latin'],
  variable: '--fonte-outfit',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Areesa _cerebro',
  description: 'Diretor de Operações da Areesa — planejamento, processos e conhecimento da agência.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={outfit.variable}>
      <body>{children}</body>
    </html>
  );
}
