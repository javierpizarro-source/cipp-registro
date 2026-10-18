# cipp-registro

Réplica funcional del registro REDCap del CIPP (Corporación de Innovación en Piso Pélvico, PID 27).

**PROTOTIPO EN PRUEBAS — SOLO DATOS FICTICIOS.** Nunca subir datos reales de pacientes a este repositorio: es público.

Sitio: https://javierpizarro-source.github.io/cipp-registro/ (acceso con clave).

Los 21 instrumentos del proyecto (1.941 campos), agrupados por sus 9 eventos, generados desde el codebook REDCap con tipos de campo, opciones, validaciones, lógica de salto (1.440 reglas), campos calculados, campos requeridos y referencias cruzadas entre eventos.

- `dictionary.js` — diccionario de datos (editar aquí para modificar campos). Región/comuna: lista oficial de 16 regiones y 342 comunas (fuente: juanbrujo/chile-regiones-comunas). Operadores/cirujanos: autocompletado editable.
- `app.js` — motor de formularios (renderiza el diccionario, evalúa lógica y cálculos, guarda en el navegador).
- Exportación CSV por instrumento y respaldo/importación JSON.

Tras editar archivos, subir el número `?v=N` de los assets en `index.html` para saltar el caché de GitHub Pages (~10 min).

Fases siguientes (pendientes de aprobación): backend privado para datos reales y migración desde REDCap.
