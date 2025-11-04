# Yummy Recs - Logo Assets

This document describes the logo assets created for the Yummy Recs application.

## Logo Concepts

### 1. Speech Bubble Plate 💬🍽️

**Concept**: Combines a plate (representing food) with a speech bubble (representing social recommendations).

**Files**:
- `public/logo-speech-bubble-plate.svg` - Standalone logo (200x200)
- `public/logo-icon-plate.svg` - App icon version (512x512, rounded square)

**Colors**:
- Coral to Orange gradient: `#FF6B6B` → `#FF8E53`
- Accent gold: `#FFD700`

**Best for**: Emphasizing the social/recommendation aspect of the app

---

### 2. Tasty Star ⭐

**Concept**: A star (representing ratings) with a bite taken out (representing food/yummy).

**Files**:
- `public/logo-tasty-star.svg` - Standalone logo (200x200)
- `public/logo-icon-star.svg` - App icon version (512x512, rounded square)

**Colors**:
- Golden Orange gradient: `#FFB300` → `#FF8F00` → `#FF6F00`
- White sparkles for delight

**Best for**: Simple, memorable, playful brand identity

---

## Viewing the Logos

### Option 1: Interactive Preview Page
Open in your browser:
```
http://localhost:1420/logo-preview.html
```

This page lets you:
- View both logo concepts side-by-side
- Test them on different backgrounds
- See them at different sizes (64px, 128px, 200px)
- Understand the design rationale

### Option 2: Direct SVG Files
The SVG files can be opened directly in:
- Any web browser
- Design tools (Figma, Sketch, Adobe Illustrator)
- Code editors with SVG preview

---

## Usage Recommendations

### For App Icons (PWA/Mobile)
Use the app icon versions (`logo-icon-*.svg`):
- Already have rounded corners (115px radius)
- Optimized for small sizes
- Work well on colored backgrounds

Generate PNG versions at these sizes:
- 64x64 (favicon)
- 192x192 (PWA)
- 512x512 (PWA, high-res)
- 1024x1024 (App Store, if going native)

### For Website/Marketing
Use the standalone versions (`logo-*.svg`):
- More detailed
- Work well at larger sizes
- Can be placed on any background

### For Social Media
Create square PNG exports at:
- 400x400 (Twitter, Facebook profile)
- 1200x1200 (High-resolution social posts)

---

## Converting SVG to PNG

You can use various tools to convert SVG to PNG:

### Using ImageMagick (command line)
```bash
# Install ImageMagick
sudo apt-get install imagemagick

# Convert to PNG at different sizes
convert -background none logo-icon-star.svg -resize 192x192 logo-192.png
convert -background none logo-icon-star.svg -resize 512x512 logo-512.png
```

### Using Online Tools
- [CloudConvert](https://cloudconvert.com/svg-to-png)
- [SVG to PNG Converter](https://svgtopng.com/)

### Using Design Tools
- Open SVG in Figma/Sketch
- Export as PNG at desired sizes

---

## Customization

Both logos are fully customizable. You can:

1. **Change colors**: Edit the gradient stop colors in the `<defs>` section
2. **Adjust size**: The `viewBox` attribute controls the canvas size
3. **Modify shapes**: All paths and shapes can be adjusted
4. **Add elements**: The SVG format allows adding new design elements

Example color change:
```svg
<!-- Change from coral to blue -->
<linearGradient id="bgGradient">
  <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
  <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
</linearGradient>
```

---

## Recommendation

Based on the app's focus on **social recommendations** and **food discovery**, I recommend:

**Primary Logo**: **Tasty Star** ⭐
- Simple and memorable
- Works beautifully as an app icon
- The "bite" is playful and instantly communicates "food"
- Golden color feels warm and inviting
- Scales well to small sizes

**Alternative**: **Speech Bubble Plate** for marketing materials where you want to emphasize the social/community aspect.

---

## Next Steps

1. Choose your preferred logo
2. Test it in your app's header/navigation
3. Generate PNG versions for app icons
4. Update favicon and PWA manifest icons
5. Consider trademark registration if launching publicly
