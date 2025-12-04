# Logo Update Instructions

## ✅ Completed Updates

1. **Navbar Logo**: Updated to use `/img/logo.svg` (already configured)
2. **Favicon SVG**: Created new `/img/favicon.svg` with glowing X design
3. **Manifest.json**: Updated to include maskable icons
4. **Header References**: Updated favicon and Apple touch icon references

## 🔄 Files That Need PNG Generation

The following PNG files need to be generated from the new logo design (glowing X):

### Required Sizes:
- `favicon-16x16.png` - Browser favicon (16x16)
- `favicon-32x32.png` - Browser favicon (32x32)
- `apple-touch-icon.png` - iOS home screen icon (180x180)
- `icon-192.png` - PWA icon (192x192)
- `icon-192-maskable.png` - PWA maskable icon (192x192) - with safe zone padding
- `icon-512.png` - PWA icon (512x512)
- `icon-512-maskable.png` - PWA maskable icon (512x512) - with safe zone padding

### How to Generate:

1. **Using Online Tools:**
   - Use https://realfavicongenerator.net/ or https://favicon.io/
   - Upload your logo.svg or the glowing X image
   - Generate all required sizes

2. **Using ImageMagick (Command Line):**
   ```bash
   # Convert SVG to PNG at different sizes
   magick convert logo.svg -resize 16x16 favicon-16x16.png
   magick convert logo.svg -resize 32x32 favicon-32x32.png
   magick convert logo.svg -resize 180x180 apple-touch-icon.png
   magick convert logo.svg -resize 192x192 icon-192.png
   magick convert logo.svg -resize 512x512 icon-512.png
   
   # For maskable icons, add padding (80% of canvas, centered)
   magick convert logo.svg -resize 154x154 -gravity center -extent 192x192 -background transparent icon-192-maskable.png
   magick convert logo.svg -resize 410x410 -gravity center -extent 512x512 -background transparent icon-512-maskable.png
   ```

3. **Using Design Software:**
   - Open logo.svg in Figma/Illustrator/Photoshop
   - Export at each required size
   - For maskable icons, ensure the logo is 80% of the canvas size with padding

## 🗑️ Files to Delete (Old Icons)

The following files should be deleted as they don't match the new glowing X theme:

**Note:** These will be automatically replaced when you generate the new PNG files above.

- `favicon-16x16.png` (old version)
- `favicon-32x32.png` (old version)
- `apple-touch-icon.png` (old version)
- `icon-192.png` (old version)
- `icon-192-maskable.png` (old version)
- `icon-512.png` (old version)
- `icon-512-maskable.png` (old version)

**Safe to Keep:**
- `logo.svg` ✅ (as specified)
- `favicon.svg` ✅ (newly created)
- Shortcut icons (icon-feed.png, icon-messages.png, etc.) - These are functional and can be updated later if needed

## 📝 Current Status

- ✅ Navbar uses logo.svg
- ✅ Favicon SVG created with glowing X design
- ✅ All HTML references updated
- ✅ Manifest.json updated
- ⏳ PNG icons need to be generated (see above)
- ⏳ Old PNG files need to be replaced

## 🎨 Design Notes

The new logo features:
- Glowing X with magenta/pink left arm
- Cyan/blue right arm
- Purple center intersection
- Dark cosmic background
- Modern, futuristic aesthetic

Ensure all generated icons maintain this visual style and color scheme.

