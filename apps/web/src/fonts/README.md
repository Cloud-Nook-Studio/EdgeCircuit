# Bundled typefaces

Both families are self-hosted so the instrument renders identically on every
platform and the app makes no third-party font request. Vite fingerprints these
files and rewrites their URLs against the deploy base path, so they work under
the GitHub Pages subpath as well as at the root.

| File | Family | Axes | Licence |
| --- | --- | --- | --- |
| `inter-latin.woff2`, `inter-latin-ext.woff2` | Inter | weight 400–700 | SIL Open Font License 1.1 |
| `newsreader-latin.woff2`, `newsreader-latin-ext.woff2` | Newsreader | optical size 6–72, weight 400–600 | SIL Open Font License 1.1 |

Inter is © The Inter Project Authors (<https://github.com/rsms/inter>).
Newsreader is © The Newsreader Project Authors
(<https://github.com/productiontype/Newsreader>).

The SIL Open Font License 1.1 permits redistribution and embedding, including
in a commercial product, provided the fonts are not sold on their own and the
copyright notice above travels with them. Full licence text:
<https://openfontlicense.org>.

Each family is split into Latin and Latin-Extended subsets by `unicode-range`
in `../styles.css`; a browser only downloads the extended subset if the page
actually renders a character from it. Typical first load is therefore
`inter-latin` plus `newsreader-latin`.

Replacing the pair means editing the `@font-face` blocks and the
`--font-serif` / `--font-sans` tokens at the head of `../styles.css`. Nothing
else names a family directly.
