# Fotos de prueba de tickets

Fotos reales de etiquetas de balanza sacadas en el puesto, para probar la lectura de tickets (`src/lib/tickets/`). Están rotadas para verse derechas. La app igual prueba las cuatro orientaciones, así que también sirven giradas para probar ese caso.

| Archivo                          | Producto | Peso     | Precio      | Total       | Notas                                                         |
| :------------------------------- | :------- | :------- | :---------- | :---------- | :------------------------------------------------------------ |
| `porsalu-bolsa.jpg`              | Porsalu  | 2,535 kg | $ 8.650/kg  | $ 21.927,75 | Etiqueta chica sobre bolsa verde con film.                     |
| `porsalu-bolsa-curvada.jpg`      | Porsalu  | 2,535 kg | $ 8.650/kg  | $ 21.927,75 | El mismo ticket, de cerca, con la etiqueta curvada y algo movida. |
| `sardo-con-codigo-de-barras.jpg` | Sardo    | 0,475 kg | $ 16.950/kg | $ 8.051,25  | Sobre el queso, con código de barras.                          |

En los tres se cumple peso × precio = total. Es el chequeo que usa el lector para confirmar que leyó bien.

Para sumar casos nuevos (sobre todo de otras marcas y balanzas), se agregan las fotos acá con una fila en esta tabla.
