# Open Peeps (Lesson 4's two friends)

- **Library:** Open Peeps by Pablo Stanley, https://openpeeps.com
- **Licence:** CC0 (public domain): "Free for commercial and personal use under CC0 License";
  copying, modifying and recolouring are allowed, no credit required. Read on openpeeps.com on
  2026-11-18; the owner chose this library the same day.
- **Files:** `lena.svg` (peep-38, the calm investor) and `zoe.svg` (peep-67, the active trader).
  Each is recoloured **by role**, with natural colours (owner 2026-11-18: the first version, white
  line art on purple, looked wrong; people get believable skin):

  | Role                                     | Lena                    | Zoe                                    |
  | ---------------------------------------- | ----------------------- | -------------------------------------- |
  | Skin (face, hands)                       | `#c58c63` warm brown    | `#f1c7a3` light peach                  |
  | Ink (hair, hijab, outlines, dark jumper) | `#3a2c3f`               | `#3b2d3a`                              |
  | Clothes                                  | `#86b8a0` sage cardigan | `#f2b64a` amber jumper dots and collar |
  | Accent (the mug)                         | `#e9b44c`               | the phone, as the jumper               |

  The art carries its own palette (an illustration, not UI: `design.md`'s no-hex rule is for
  components). The source files paint the skin, the clothes and the hands as one shape, so the
  hands are the clothes shape painted again in skin, clipped to a small ellipse over each hand
  (`clipPath` in the file). The disc behind each figure is drawn in `LessonArt.tsx`/`.module.css`
  from tokens (green and amber mixed with white).

- Other files in the library are not copied: add one only after the owner's visual Q&A.
