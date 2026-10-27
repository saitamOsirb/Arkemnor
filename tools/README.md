# Tools — ARKEMNOR

Herramientas autónomas del pipeline de desarrollo. No se compilan junto con el cliente Godot ni con el servidor C#.

## Disponible

**[ARKEMNOR Sprite & Map Editor](arkemnor-editor/README.md)** — Editor web sin dependencias, visor de spritesheets por dirección, pintura de terrenos por capas y exportación/importación Tiled TMJ/JSON con imágenes PNG.

Para iniciar desde la raíz del repositorio:

```bash
python -m http.server 8080 --directory tools/arkemnor-editor
```

Abrir http://localhost:8080

## Regla de independencia

Las herramientas pueden evolucionar dentro de `tools/` con su propia tecnología y configuración; no forman parte del cliente ni del runtime del servidor.
