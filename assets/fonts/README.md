# App fonts

The app embeds **Pretendard JP Variable 1.3.9** from the [official Pretendard JP distribution](https://github.com/orioncactus/pretendard/tree/v1.3.9/packages/pretendard-jp/dist).

- Font: `public/variable/PretendardJPVariable.ttf` (unmodified).
- SHA-256: `bc1d77db0f3cb9c20986b8939aa8a28d5216552d777d082955da22f420535cbb`.
- License: SIL Open Font License 1.1, retained in `PretendardJP-OFL.txt` and the app's open-source notices.

Android uses this family for app text, navigation and platform text controls. It includes Korean and Latin glyphs as well as Japanese kana and kanji. iOS uses its system fonts for every language, including Japanese, and does not embed this font. Explicit font overrides still take precedence.

The original `PretendardVariable.ttf` and its license remain preserved in this directory but are no longer embedded by the font plugin. `node scripts/check-typography.cjs` verifies representative glyph coverage, Korean/Latin advance widths, font configuration and shared component behavior. Actual font rendering still needs device verification.
