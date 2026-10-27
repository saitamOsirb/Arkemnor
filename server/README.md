# Server — ARKEMNOR

Proyecto **independiente** de servidor C# / ASP.NET Core (.NET 10).

El servidor será **autoritativo**: validará movimiento, habilidades, combate, inventario, progresión, criaturas y persistencia. La separación futura entre Dominio, Aplicación e Infraestructura ocurrirá dentro de `server/`, sin dependencias de `client/` o `tools/`.

## Requisitos

- SDK .NET 10.

## Ejecutar

```bash
dotnet run --project server/src/Arkemnor.Server
```

Desde la raíz del repositorio. Para comprobar el arranque, solicitar `GET /health` a la dirección local anunciada por ASP.NET Core.

## Estado

Actualmente contiene un endpoint HTTP de salud como punto de partida. Todavía no contiene WebSocket, autenticación, mundo persistente ni combate.
