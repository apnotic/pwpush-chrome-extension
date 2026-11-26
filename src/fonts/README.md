# Inter Variable Font

## Current File

`InterVariable.woff2` (96KB) - Subset to Latin + Latin-Extended

## Subsetting

The font is subset from the full Inter Variable (344KB) to support the extension's locales (en, de, es, fr, it, nl) while keeping the file size small.

**To regenerate the subset:**

```bash
# Install fonttools with Brotli support
pip3 install fonttools brotli

# Subset the font to Latin + Latin-Extended
pyftsubset InterVariable-full.woff2 \
  --unicodes="U+0020-007F,U+00A0-00FF,U+0100-017F" \
  --output-file=InterVariable.woff2 \
  --flavor=woff2 \
  --layout-features='*' \
  --no-hinting
```

**Unicode ranges:**
- U+0020-007F: Basic Latin
- U+00A0-00FF: Latin-1 Supplement (accented characters)
- U+0100-017F: Latin Extended-A (additional accented characters)

**Result:** 344KB → 96KB (72% reduction)

## Source

Inter Variable font from https://rsms.me/inter/ (OFL 1.1 license)
