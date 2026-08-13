# Respuesta a Walter — Proyecto MAGO

> Texto listo para enviar. Reemplazar los campos entre corchetes antes de mandarlo.

**Asunto:** MAGO — Motor fiscal Mercado Libre Argentina: propuesta de honorarios

---

Hola Walter, ¿cómo estás?

Gracias por el detalle con el que planteaste la consulta. Se nota que el proyecto está
pensado, y sobre todo se agradece la aclaración del alcance: coincidimos en que MAGO no
reemplaza al contador. Eso está bien encuadrado y así va a quedar expresado en el informe
que te entreguemos.

Confirmamos que podemos hacer el trabajo. Es exactamente el tipo de consulta en la que
trabajamos: vendedores de Mercado Libre, IVA, IIBB, Convenio Multilateral y regímenes de
retención y percepción.

**Una observación de alcance, antes de los números**

Lo que necesitás no son diez respuestas sueltas. Tres de las diez preguntas (2, 3 y 4) sí se
resuelven con un porcentaje y un umbral, tal como pedís. Pero las otras siete —en particular
la 1, la 8 y la 10— no tienen un valor único: la respuesta correcta es una función de varias
variables (condición frente al IVA, jurisdicción, actividad, padrón, resultado del control
sistémico de ARCA). Si te las entregamos como texto, tu equipo va a tener que volver a
interpretarlas para programarlas, y ahí es donde se rompen los motores fiscales.

Por eso te proponemos como entregable central la regla ya parametrizada: variable de entrada,
base de cálculo, condición que la activa, alícuota, vigencia y fuente normativa. Es el mismo
trabajo técnico, entregado en un formato que tu equipo puede cargar sin reinterpretar.

**Un dato que conviene que tengas presente desde el diseño del sistema**

Estas reglas se mueven, y bastante. Las retenciones nacionales de IVA y Ganancias sobre
cobros electrónicos fueron derogadas en septiembre de 2024. Los parámetros de habitualidad
para plataformas digitales se modificaron en diciembre de 2025. Los topes del monotributo se
actualizaron el 1° de agosto de 2026. Si MAGO guarda las alícuotas como constantes, queda
desactualizado en meses; conviene que cada alícuota se guarde con su fecha de vigencia.

**Opciones y honorarios**

| | Alcance | Honorarios | Plazo |
|---|---|---|---|
| **A** | Las 10 respuestas documentadas, en formato ficha (alícuota, base, condición, fuente), informe PDF firmado | **USD 2.400** | 10 días hábiles |
| **B** | Todo lo de A + planilla de parámetros lista para cargar + árboles de decisión por régimen + matriz de datos mínimos por operación + 12 casos de prueba resueltos | **USD 3.900** | 15 días hábiles |
| **C** | Todo lo de B + mantenimiento normativo mensual: aviso de cada cambio que impacte una regla, actualización de la planilla y hasta 3 consultas técnicas por mes | **USD 3.900 + USD 390/mes** (mínimo 6 meses) | Ídem B |

Te recomendamos la **Opción B**, y la **C** si MAGO sale a producción durante 2026.

Sobre los cuatro puntos que preguntaste puntualmente:

- **Honorarios:** los de la tabla. 50% al aceptar, 50% contra entrega. Si MAGO factura como
  sujeto local, emitimos comprobante en pesos al tipo de cambio vendedor del Banco Nación del
  día anterior al pago; si la contratante es una entidad del exterior, va Factura E por
  exportación de servicios.
- **Plazo:** 15 días hábiles para la Opción B, con un avance parcial al día 8 para que el
  equipo pueda empezar a modelar sin esperar la entrega final.
- **Por escrito:** sí, íntegramente. Informe firmado con matrícula, más la planilla de
  parámetros y los casos de prueba.
- **Aclaraciones posteriores:** incluidas. Dos reuniones de 60 minutos con tu equipo técnico y
  30 días de consultas por escrito sobre lo entregado.

**Sobre la segunda etapa**

De acuerdo en dejarla afuera de este bloque. Cuando cierren el motor fiscal, la fiscalidad
propia de MAGO —encuadre de la plataforma frente al IVA, Factura E y exportación de servicios,
tratamiento de los ingresos por suscripción y estructura internacional para la expansión
regional— la presupuestamos por separado. Como referencia preliminar, sujeta a definición de
alcance, estaría en el orden de USD 1.500 a USD 2.200.

Y sobre la expansión a otros países prevista para 2027: la arquitectura de reglas de la
Opción B está pensada para que sumar una jurisdicción nueva sea cargar parámetros y no
reescribir el motor.

Quedamos a disposición. Si querés, coordinamos una llamada de 20 minutos antes de decidir,
para repasar el alcance con tu equipo técnico y que puedan validar que el formato del
entregable les sirve.

Un saludo,

[Nombre y apellido]
Contador Público — Matrícula T° [ ] F° [ ]
Consejo Profesional de Ciencias Económicas de la Ciudad Autónoma de Buenos Aires
[correo] · [teléfono]
