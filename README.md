# MYRMEX — Imperio bajo la hierba

Un RTS de colonias de hormigas para el navegador. Dirige tu colonia, excava túneles y cámaras, cría castas,
explora el mundo, investiga tecnologías, expande tu territorio y derrota a colonias rivales y depredadores.

## Jugar

- **Directo:** abre `dist/index.html` (o `../MYRMEX.html`) en Chrome, Edge o Firefox. Es un único archivo autocontenido.
- **Desarrollo:** `npm install` y `npm run dev` → http://127.0.0.1:4747
- **Compilar:** `npm run build` genera `dist/index.html`.

La partida se guarda automáticamente (cada minuto, al amanecer y al cerrar la pestaña) en el almacenamiento local del navegador.

## Controles

| Acción | Tecla / ratón |
|---|---|
| Seleccionar | Arrastrar con clic izquierdo · doble clic: misma casta |
| Ordenar (mover / atacar / recolectar / construir) | Clic derecho · Shift+clic derecho: patrullar |
| Cámara | WASD / flechas / borde de pantalla / rueda (zoom) / botón central |
| Superficie ↔ Hormiguero | Tab |
| Colonia · Investigación · Construir · Logros · Estadísticas | C · R · B · L · E |
| Ejército / obreras visibles | Q / Z |
| Detener / volver | X / H |
| Grupos | Ctrl+1…9 crear · 1…9 seleccionar (doble: centrar) |
| Hormiguero: excavar / cancelar / decorar | F / X / V |
| Pausa · velocidad · guardado rápido | Espacio · , . · F5 |

## Contenido

- 7 castas (Obrera, Exploradora, Cortadora, Soldado, Lanzaácido, Coloso, Princesa alada) + la Reina.
- 9 tipos de cámara con 3 niveles, 12 decoraciones con prestigio, 4 edificios de superficie y nidos satélite.
- 27 tecnologías en 3 ramas, 34 objetivos encadenados, 24 logros, niveles de colonia.
- 10 especies de criaturas (incluidos jefes), 12 acontecimientos, ciclo día/noche y clima.
- IA rival que crece, se expande, lanza incursiones y lucha también contra otras colonias.
- Feromonas y caminos emergentes, arte y audio 100 % procedurales (Canvas 2D + Web Audio).

## Cooperativo online (2 jugadoras)

1. Anfitriona: en partida, menú de pausa → **Invitar a una amiga** → copia el código.
2. Invitada: menú principal → **Unirse a una colonia** → pega el código → copia la respuesta.
3. Anfitriona: pega la respuesta → **Conectar**.

Conexión P2P por WebRTC (STUN público, sin servidores propios). La anfitriona simula el mundo; la invitada
recibe instantáneas comprimidas (~40 KB/s) y sus órdenes se ejecutan en la partida de la anfitriona.
Chat con Enter y señales en el mapa con Alt+clic. Redes muy restrictivas (NAT simétrico) pueden impedir la conexión.
