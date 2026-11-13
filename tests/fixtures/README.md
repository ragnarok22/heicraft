# HEIC fixture

`pattern.heic` is an original, procedurally generated 32 × 32 RGB image, licensed
under this project's [MIT license](../../LICENSE). It contains no external artwork
or personal metadata.

Its pixels are `(x < 16 ? 220 : 40, y < 16 ? 180 : 60, 100)`. The RGB raster was
saved as PNG with Sharp, then encoded with macOS ImageIO using:

```sh
sips --setProperty format heic pattern.png --out pattern.heic
```

Integration tests replace the `ftyp` contents without changing the box length.
This preserves the image payload and all item offsets while exercising different
major/compatible brands and extended-size box headers. The `heim`/`heis` variants
retain generic `mif1` compatibility; libheif does not accept those brands alone.

## Rotation and transparency

`oriented-alpha.heic` is also original procedural artwork under the MIT license.
Its source raster is 40 × 24 RGBA:
`(x < 20 ? 220 : 40, y < 12 ? 180 : 60, 100, x < 20 ? 255 : 96)`.
The PNG raster was encoded losslessly with libheif 1.23.7:

```sh
heif-enc -L --rotate-cw 90 -o oriented-alpha.heic oriented-alpha.png
```

The HEIF rotation presents a 24 × 40 image. Tests check rotated color samples and
the real auxiliary alpha image, rather than relying on mocked decoder pixels.
