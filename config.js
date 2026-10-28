// Configuración de la tienda. Es lo único que hay que tocar para ponerla en marcha.
window.TIENDA_CONFIG = {
  nombre: 'BYN Fragancias',
  subtitulo: 'Perfumería · Originales y decants',
  instagram: 'https://www.instagram.com/bynfragancias/',
  // Número de WhatsApp con código de país, sin + ni espacios (ej: 5491123456789)
  whatsapp: '5490000000000',

  // Fuente del catálogo (usar UNA de las dos; si ambas están vacías se muestran datos de demo):
  // 1) URL del Apps Script publicado (recomendado: stock al instante + registra pedidos en la hoja)
  appsScriptUrl: '',
  // 2) URL CSV de la hoja "Productos" publicada en la web (Archivo > Compartir > Publicar en la web > CSV)
  csvUrl: '',

  // Cada cuántos segundos se vuelve a leer el stock mientras la página está abierta
  refrescoSegundos: 60,
  // Desde cuántas unidades o menos se muestra "Últimas unidades"
  pocoStock: 3,
};
