# Icons

Chrome extensions require PNG icons in the following sizes:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

## Quick Generation

Open `generate-icons.html` in any web browser. It will render the ScouterBot icon at all three sizes using HTML5 Canvas. Right-click each image and choose **"Save image as..."** to download the PNGs into this folder.

## Manual Alternative

If you prefer to create your own icons:
1. Design a 128x128 PNG icon.
2. Scale it down to 48x48 and 16x16.
3. Place all three files in this `icons/` folder.
4. Ensure `manifest.json` references them correctly (it already does).

