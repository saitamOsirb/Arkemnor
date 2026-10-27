# ARKEMNOR — Sprite & Map Editor (Alpha 0.1)

Editor web **independiente**, sin bibliotecas externas ni instalación de paquetes, dentro de `tools/`.
No requiere arrancar el servidor C# ni el juego Godot.

## Abrir

Desde la raíz del repositorio:

```bash
python -m http.server 8080 --directory tools/arkemnor-editor
```

En Windows con el lanzador de Python:

```powershell
py -m http.server 8080 --directory tools/arkemnor-editor
```

Abrir **http://localhost:8080**. También sirve cualquier servidor HTTP estático local. No abrir `index.html` directamente como `file://`: los navegadores restringen la carga de módulos JavaScript en ese modo.

## Map Editor

1. Se abre un mapa de demostración de 32×22 generado con un tileset **original**.
2. Seleccionar un tile de la paleta y usar Pincel, Borrar, Rellenar o Copiar. H coloca el modo de desplazamiento; clic central o Shift+arrastrar también desplazan. La rueda controla el zoom.
3. Crear capas de tiles, ordenarlas, renombrarlas con doble clic o alternar su visibilidad.
4. Seleccionar «Entidad» para añadir puntos de tipo Spawn, NPC, Monster, Portal o Trigger. Se escriben como puntos en una `objectgroup` de Tiled.
5. Importar PNG adicionales en la biblioteca, indicando el tamaño de sus tiles antes de importarlos (32×32 o 64×64, por ejemplo).
6. **Exportar ZIP Tiled** descarga un único ZIP que contiene el mapa `.tmj` y los PNG en la subcarpeta `textures/`. Extraer ambos y abrir el `.tmj` en **Tiled**.
7. **Exportar TMJ** descarga únicamente el JSON. Si se utiliza esta opción, las imágenes referenciadas deben estar junto al TMJ en la misma carpeta.
8. Para **importar** un mapa existente, seleccionar `.tmj` y los PNG necesarios desde el explorador (o importar después los PNG faltantes con «Importar tileset PNG»). El emparejamiento es por nombre de archivo.

### Límites actuales (deliberados)

- Mapas **ortogonales**, de tamaño **fijo**, máximo 256×256 celdas.
- Formato Tiled **TMJ/JSON**, capas `tilelayer` con `data` como array de GID numéricos sin compresión, y `objectgroup`. No se admite todavía TMX/XML, mapas isométricos, mapas infinitos con chunks, capas en grupo/imagen ni tilesets externos `.tsj`.
- Se conservan los GID de Tiled y sus bits de orientación en el JSON. En el lienzo, el volteo diagonal de tiles rectangulares puede diferir del de Tiled y necesita una mejora específica.
- Las entidades se representan como marcadores de editor, no se ejecutan scripts del juego.
- Los cambios viven en memoria: **exportar antes de cerrar o refrescar el navegador**.
- No hay todavía autotiling/Wang sets, pintado automático de juntas, colisiones poligonales o mapa isométrico; se incorporarán en futuras iteraciones.

## Sprite Studio

1. Importar un spritesheet **PNG con transparencia**.
2. Configurar ancho/alto del frame, frames por dirección, FPS, fila y columna iniciales y las cuatro direcciones (Sur, Este, Norte y Oeste).
3. Visualizar el sprite ampliado con nearest-neighbor sin suavizado, reproducir/pausar y avanzar frame por frame.
4. Inspeccionar el atlas y seleccionar el fotograma; exportar la configuración a `.sprite.json`.

Este JSON de sprites es un **formato propio de ARKEMNOR**, no una extensión oficial de Tiled.

## Pruebas

Con Node.js 20+:

```bash
node --test tools/arkemnor-editor/tests/tiled.test.mjs
node --check tools/arkemnor-editor/src/main.mjs
```

Sin npm ni instalación de dependencias.

## Próximos avances

- Autotiling con reglas de bordes/esquinas y Wang sets de Tiled.
- Previsualización isométrica y edición de elevación de terreno para 2.5D.
- Múltiples plantas, colisiones y navegación.
- Entidades visuales animadas colocadas sobre los mapas.
- Pipeline de importación al cliente Godot con validación de atlas y metadatos.
