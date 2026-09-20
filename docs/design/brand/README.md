# Hallyu brand assets

All assets are vector sources (SVG) plus PNG renders for convenience. Specs live in `../04-design-language.md` §1.

| File | What it is | Export |
|---|---|---|
| `app-icon-adaptive-foreground.svg` | Adaptive icon foreground layer (108dp canvas; content inside the 66dp safe circle) | `mipmap-*/ic_launcher_foreground` (also `app-icon-adaptive-foreground-1024.png`) |
| `app-icon-adaptive-background.svg` | Adaptive icon background layer (solid `#0A0A0A`) | `ic_launcher_background` or a `<color>` resource |
| `app-icon-adaptive-monochrome.svg` | Monochrome layer for Android 13+ themed icons | `ic_launcher_monochrome` (also `…-monochrome-1024.png`) |
| `app-icon-legacy-512.svg` / `app-icon-512.png` | Legacy launcher + Play Store icon (512×512, no alpha) | Play Console · `mipmap-*/ic_launcher` for API < 26 |
| `notification-icon.svg` | Notification small icon (white silhouette on transparent) | `drawable/ic_stat_hallyu` |
| `signal.svg` | The Signal (brand dot) | inline vector |
| `hallyu-wordmark.svg` | `Hallyu.` wordmark, letterforms converted to outlines (Pretendard ExtraBold, tracking −3%) | Home top bar (22dp cap height), web, share cards |
| `hallyu-lockup-horizontal.svg` | Mark + wordmark lockup | store listing, web, share-card footer |
| `brand-preview.png` | Rendered preview of everything above under the three launcher masks | — |

Rules: never recolour the wordmark in Rose; never add gradients, borders or glows to the icon; the Signal is Rose 600 `#E11D48` everywhere except the monochrome/notification layers.
