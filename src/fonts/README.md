# Inter Variable Font

## Current File

`InterVariable.woff2` (96KB) - Subset to Latin + Latin-Extended

## License

**Inter v4.1** is licensed under the [SIL Open Font License 1.1](OFL.txt).

Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter)

The font is redistributed in subset form with this extension in compliance with the OFL 1.1 license. See `OFL.txt` for the full license text.

## Subsetting

The font is subset from the full Inter Variable (344KB) to support the extension's locales (en, de, es, fr, it, nl) while keeping the file size small and preserving copyright/license metadata.

**To regenerate the subset:**

```bash
# Install fonttools with Brotli support
pip3 install fonttools brotli

# Subset the font to Latin + Latin-Extended
# --name-IDs='*' preserves copyright and license metadata in the font file
pyftsubset InterVariable-full.woff2 \
  --unicodes="U+0020-007F,U+00A0-00FF,U+0100-017F" \
  --output-file=InterVariable.woff2 \
  --flavor=woff2 \
  --layout-features='*' \
  --name-IDs='*' \
  --no-hinting
```

**Unicode ranges:**
- U+0020-007F: Basic Latin
- U+00A0-00FF: Latin-1 Supplement (accented characters)
- U+0100-017F: Latin Extended-A (additional accented characters)

**Result:** 344KB → 96KB (72% reduction)

## Source

Inter Variable font from https://rsms.me/inter/
