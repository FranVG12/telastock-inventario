import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'TelaStock | Inventario de piezas',
  description: 'Inventario de piezas por modelo y talla para fabricación textil',
  applicationName: 'TelaStock'
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
