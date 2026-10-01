// Producción (rama main → guizadaaliaga.com). Se usa con
// `ng build --configuration production` (la configuración por defecto de
// `ng build`) vía fileReplacements en angular.json. Cada valor de este
// archivo es público: termina en el bundle que baja cualquier navegador. La key de
// Supabase es la publicable (anon), nunca la service_role.
export const environment = {
  production: true,
  backendUrl: 'https://api.guizadaaliaga.com',
  supabase: {
    url: 'https://vmeigxwssmsaagqgaysl.supabase.co',
    anonKey: 'sb_publishable_j_OmcZPFaE1q_la0sMZA9Q_PIvG2EX9',
  },
};
