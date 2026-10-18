# cipp-registro

Réplica funcional del registro REDCap del CIPP (Corporación de Innovación en Piso Pélvico, PID 27).

**PROTOTIPO EN PRUEBAS — SOLO DATOS FICTICIOS.** Nunca subir datos reales de pacientes a este repositorio: es público.

Sitio: https://javierpizarro-source.github.io/cipp-registro/ (acceso con clave).

Piloto "ruta Bulkamid": instrumentos PACIENTE, CONSULTA, CISTOMETRÍA SIMPLE y CIRUGÍA/PROCEDIMIENTO, generados desde el codebook REDCap con sus tipos de campo, opciones, validaciones, lógica de salto, campos calculados y campos requeridos.

- `dictionary.js` — diccionario de datos (editar aquí para modificar campos)
- `app.js` — motor de formularios (renderiza el diccionario, evalúa lógica y cálculos, guarda en el navegador)
- Exportación CSV por instrumento y respaldo/importación JSON.

Fases siguientes (pendientes de aprobación): backend privado para datos reales y migración desde REDCap.
