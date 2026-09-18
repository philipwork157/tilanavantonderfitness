# Billing PDF font

Noto Sans Regular is bundled for private, server-generated billing PDFs so PDF
generation does not fetch fonts from the network. Its SIL Open Font License is
included in `LICENSE`.

Upstream sources:

- https://github.com/notofonts/noto-fonts/blob/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf
- https://github.com/notofonts/noto-fonts/blob/main/LICENSE

SHA-256 of the bundled font:
`b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5`

The renderer rejects unsupported glyphs rather than silently producing missing
characters. Extend the bundled font coverage before accepting billing text that
requires additional scripts.
