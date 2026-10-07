# Frontend — Clínica Dental Guizada-Aliaga

Aplicación Angular 21. La documentación del proyecto (instalación, variables de entorno, usuarios de
prueba, arquitectura y endpoints) está en el [README de la raíz](../README.md).

## Responsividad en el celular

El panel se diseña para funcionar desde 360 px de ancho (CLI-246). Los patrones comunes están en
[`src/styles/_responsive.scss`](src/styles/_responsive.scss): tabla → tarjetas, diálogo → hoja a
pantalla completa, objetivo táctil de 44 px. El ancho en TypeScript sale de `ViewportService`
(`isMobile`, menos de 768 px).

Antes de cada release (o al tocar una pantalla), correr la auditoría:

1. Abrir la pantalla con DevTools en modo dispositivo (360×740 y 390×844; 768×1024 para tablet).
2. Pegar en la consola el contenido de [`scripts/responsive-audit.js`](scripts/responsive-audit.js).
3. Ejecutar `responsiveAudit()`. Lista lo que se sale de la pantalla, lo que queda cortado, botones
   chicos, letra chica, inputs que hacen zoom en iOS y diálogos sin scroll. Los marcados `grave`
   tienen que quedar en cero.

Para revisar con la sesión ya abierta y sin tocar la ventana: `responsiveHarness(390, 844, '/dashboard')`
carga la app en un iframe de ese tamaño, y `responsiveAudit(responsiveFrame())` audita lo que se ve
dentro.
