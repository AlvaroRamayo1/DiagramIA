# DiagramIA

Un taller web en español para explorar un brazo robótico antes de comprar las piezas. Incluye un ensamblado guiado en 3D, un circuito lógico y una simulación de movimientos. El proyecto inicial funciona sin cuentas, servicios externos ni claves de API.

## Empezar

Descargá el repositorio desde GitHub con **Code → Download ZIP** y descomprimilo. Abrí una terminal dentro de la carpeta descargada (por ejemplo, `DiagramIA-main`).

Usá Node.js 24.19.0 (indicado en `.nvmrc`) y npm, que viene incluido con Node.js. También se admite Node.js 22.12 o posterior.

```bash
npm ci
npm run dev
```

El servidor usa el puerto 5173. En una instalación local, abrí la dirección que imprime Vite. Para compilar los archivos estáticos:

```bash
npm run build
npm run preview
```

La carpeta `dist/` se puede servir con cualquier alojamiento estático. Esta tarea no publica la aplicación.

## Un recorrido sencillo

1. **Ensamblado:** elegí la base, el brazo superior o el antebrazo. Cambiá sus dimensiones y el ángulo o los límites de cada articulación. Agregá o quitá la pinza. Arrastrá la vista para girarla; la rueda del mouse permite acercarse. Hay vistas de perspectiva y superior.
2. **Circuito:** el ejemplo viene conectado. Cada servo necesita +5 V, tierra común y una señal del controlador. Para practicar, usá **Desconectar todo**, tocá dos puertos compatibles y comprobá lo que falta en el panel. Los bloques se pueden arrastrar; tocá un cable para eliminarlo. **Conectar automáticamente** restaura el circuito de ejemplo.
3. **Simulación:** mové los ejes, indicá un destino X/Y/Z en milímetros o guardá la posición actual. Editá el nombre, la duración y el orden de los movimientos. Ejecutá la secuencia, pausala o reiniciala. Los destinos fuera del alcance y las secuencias que exceden los límites o la altura permitida sobre la mesa se rechazan.

El proyecto se guarda automáticamente en el almacenamiento de este navegador. **Exportar proyecto** descarga un archivo `.diagramia.json`; **Más opciones → Importar proyecto** permite recuperarlo. Exportá una copia para trasladarlo a otro equipo o conservarlo si borrás los datos del navegador. Los cambios, las importaciones y las plantillas admiten deshacer y rehacer.

## Qué modela esta versión

El ensamblado tiene una cadena fija de tres articulaciones: giro de la base, hombro y codo, más una pinza opcional. No es todavía un editor de CAD ni un ensamblador de mecanismos arbitrarios.

Se calculan la cinemática directa e inversa, el alcance según las dimensiones y los límites, la interpolación de posiciones y una separación conservadora de la mesa. El sistema de coordenadas usa **Y como altura**, X hacia adelante y Z lateral; todas las distancias se expresan en milímetros.

El circuito verifica conexiones genéricas de alimentación, tierra y control, y condiciona la ejecución de la secuencia. Los nombres D3/D5/D6/D9 identifican canales del ejemplo: no representan una placa específica ni generan firmware.

No se calculan torque, masa, carga útil, velocidad máxima real, consumo, voltajes variables, colisiones entre piezas ni contacto o agarre de objetos. La trayectoria es una interpolación de ángulos; no es un planificador de obstáculos. La pinza se abre y se cierra visualmente. Elegir motores y una placa concretos permitirá ampliar el modelo con sus características y restricciones.

## Validación

```bash
npm test
npm run build
```

Las nueve pruebas existentes verifican cinemática, destinos imposibles, límites, conectividad, compatibilidad de puertos, altura sobre la mesa y validación de archivos de proyecto. La compilación incluye la comprobación de tipos de TypeScript.

También se probó el flujo completo en Chromium: edición del modelo, cableado manual, bloqueo por conexiones faltantes, cálculo de destinos, ejecución y pausa de secuencias, persistencia, importación/exportación y adaptación móvil. La vista usa WebGL; si no está disponible, se muestra un esquema del brazo y se conservan los controles y los cálculos.

## Estructura

- `src/App.tsx`: editor, persistencia y secuencias.
- `src/components/ArmScene.tsx`: representación con Three.js y controles de cámara.
- `src/components/Circuit.tsx`: editor de conexiones en SVG.
- `src/lib/robot.ts`: modelo, cinemática, validación de circuitos y archivos.
- `src/lib/robot.test.ts`: pruebas del modelo.

React, TypeScript y Vite componen la interfaz. Las dependencias están fijadas en `package-lock.json`; las próximas instalaciones deben usar `npm ci`.
