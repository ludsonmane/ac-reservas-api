// src/app/layout.tsx
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import { ColorSchemeScript, MantineProvider, createTheme, rem } from '@mantine/core';
import { Alfa_Slab_One, Comfortaa } from 'next/font/google';

export const metadata = {
  title: 'Mané Mercado • Reservas',
  description: 'Faça sua reserva no Mané Mercado (Águas Claras / Arena Brasília)',
};

// Alfa Slab One — apenas 400
const alfa = Alfa_Slab_One({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-alfa',
});

// Comfortaa para textos (pode usar 400/500 no corpo)
const comfortaa = Comfortaa({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-comfortaa',
  display: 'swap',
});

const theme = createTheme({
  primaryColor: 'green',
  defaultRadius: 'md',

  // Body: Comfortaa
  fontFamily:
    `var(--font-comfortaa), Comfortaa, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`,

  // Headings: Alfa Slab One (400)
  headings: {
    fontFamily:
      `var(--font-alfa), Alfa Slab One, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`,
    fontWeight: 400,
    sizes: {
      h1: { fontSize: rem(28), lineHeight: '1.15' },
      h2: { fontSize: rem(24), lineHeight: '1.2' },
      h3: { fontSize: rem(20), lineHeight: '1.25' },
      h4: { fontSize: rem(18), lineHeight: '1.25' },
    },
  },

  components: {
    // força Title (Mantine) a respeitar fw 400 por padrão
    Title: {
      defaultProps: { fw: 400 },
      styles: { root: { fontFamily: 'var(--font-alfa)' } },
    },

    // Altura confortável de toque (mobile)
    Button: { styles: { root: { height: rem(48) } } },
    TextInput: { styles: { input: { height: rem(48) } } },
    NumberInput: { styles: { input: { height: rem(48) } } },
    Select: { styles: { input: { height: rem(48) } } },
    TimeInput: { styles: { input: { height: rem(48) } } },
  },
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <ColorSchemeScript />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </head>

      {/* aplica variáveis de fonte no body */}
      <body
        className={`${alfa.variable} ${comfortaa.variable}`}
        style={{
          background: '#faf9f7',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        }}
      >
        <MantineProvider theme={theme}>
          {/* reforço global: h1..h4 com Alfa 400 (caso algum css externo tente sobrescrever) */}
          <style
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: `
                h1, h2, h3, h4 { 
                  font-family: var(--font-alfa), Alfa Slab One, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif !important;
                  font-weight: 400 !important;
                  letter-spacing: -0.01em;
                }
                html, body {
                  font-family: var(--font-comfortaa), Comfortaa, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
                }
              `,
            }}
          />
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
