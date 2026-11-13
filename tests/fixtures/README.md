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
major/compatible brands and extended-size box headers.
