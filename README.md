# ARKEMNOR: The Shattered Crowns

MMORPG 2.5D de fantasía medieval.

## Estructura del repositorio

Los tres directorios son proyectos independientes:

- `client/`: juego Godot 4 con **GDScript**, renderizador Compatibility y exportación Web + escritorio.
- `server/`: servidor autoritativo C#/.NET, responsable de la simulación multijugador.
- `tools/`: utilidades autónomas de producción para mapas, sprites, datos y validaciones.

Cada proyecto mantiene sus propias configuraciones, dependencias, ejecución y documentación. No hay un proyecto o gestor de dependencias compartido en la raíz.

## Inicio rápido (estructura inicial)

- Cliente: abrir `client/project.godot` con Godot 4 y ejecutar la escena inicial.
- Servidor: ejecutar `dotnet run --project server/src/Arkemnor.Server`.
- Herramientas: consultar `tools/README.md`.

> Estado: estructura inicial del repositorio. Todavía no existe un mundo multijugador funcional ni protocolo de juego implementado.

## Reglas de arquitectura

- El servidor valida todas las acciones de juego; el cliente no es fuente de verdad.
- La compatibilidad con navegadores se comprueba desde el principio.
- La comunicación cliente-servidor se diseñará para WebSocket seguro (WSS) en entornos publicados.
- Las herramientas internas no forman parte del ejecutable del cliente ni del servidor.
