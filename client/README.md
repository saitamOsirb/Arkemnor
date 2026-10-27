# Client — ARKEMNOR

Proyecto **independiente** de Godot 4 para escritorio y navegador.

- Lenguaje: **GDScript** (no C# en el cliente, por compatibilidad con exportación web de Godot 4).
- Renderizador: **Compatibility** (WebGL 2.0 para HTML5).
- Configuración y recursos: solo dentro de `client/`.
- El estado del combate y del mundo será validado por el servidor C#.

## Ejecutar

1. Abrir `client/project.godot` en el editor de Godot 4.
2. Ejecutar la escena principal con F6 o el proyecto con F5.
3. Para Web: instalar las plantillas de exportación de la versión instalada de Godot y crear un preset **Web** desde el editor. Probar cada exportación en un servidor HTTP(S), no abriendo el HTML como archivo local.

La escena inicial solo comprueba el arranque del cliente. Todavía no existe conexión de red.

## Reglas

- Evitar plugins y API no compatibles con exportación web.
- Probar la versión Web periódicamente, no solo la compilación de escritorio.
- Conexión de red futura: WebSocket, WSS bajo HTTPS.
