# Zyphora Website Visual Theme Brief

Use this document as the visual and interaction direction for the Zyphora website. The result should feel like a distinctive browser product site: quiet, precise, editorial, and technically credible.

## Creative Direction

Theme name: **Signal / Shelter**

Zyphora should feel like a clear signal in a noisy web. The visual language combines warm paper tones, deep ink, cool mineral blue, and a sharp citrus accent. It is private and calm without becoming dull, technical without looking corporate, and premium without looking luxurious.

The page should feel designed by a product team with taste, not assembled from generic SaaS sections.

## Color System

Use CSS variables and keep the palette consistent:

```css
:root {
  --ink: #172126;
  --ink-soft: #45545a;
  --paper: #f4f3ed;
  --paper-bright: #fbfaf6;
  --mist: #dce5e3;
  --mineral: #45777b;
  --mineral-dark: #28565c;
  --citrus: #d9ef79;
  --coral: #e88d72;
  --line: rgba(23, 33, 38, 0.14);
  --shadow: rgba(23, 33, 38, 0.14);
}
```

Guidance:

- Use ink for primary type and dark feature bands.
- Use paper and paper-bright for the main canvas.
- Use mineral blue for links, controls, browser chrome, and selected states.
- Use citrus only for primary actions, active privacy indicators, and small moments of energy.
- Use coral sparingly for warnings, attention states, or a contrasting feature marker.
- Avoid a purple-on-white palette, a black-only dark mode, or a page dominated by one hue.
- Use gradients only when they add depth to a background; never use a generic purple gradient.

## Typography

Use expressive fonts rather than a default system stack.

Recommended pairing:

- Display: `DM Serif Display`, `Fraunces`, or `Instrument Serif`.
- UI and body: `Manrope`, `Sora`, or `Plus Jakarta Sans`.
- Small technical labels: the body family with modest letter spacing, never condensed techno type.

Typography should create contrast between a human editorial voice and precise product UI.

- Hero heading: large but controlled, ideally 4 to 8 words.
- Body copy: comfortable reading width, approximately 55 to 68 characters per line.
- Section headings: confident and compact, never oversized for the sake of spectacle.
- Use sentence case for most interface labels.
- Avoid all-caps paragraphs and excessive letter spacing.

## Layout

- Use a wide but restrained content container, approximately 1180 to 1280px.
- Use generous horizontal margins on desktop and 20 to 24px padding on mobile.
- Favor asymmetrical editorial compositions: a strong text column beside a browser image, offset details, and occasional full-width color bands.
- Keep the browser product visible in the first viewport.
- Let the next section peek into the bottom of the first viewport on desktop and mobile.
- Use full-width bands for major sections; use cards only for repeated feature items, release details, or framed tools.
- Do not put cards inside cards.
- Keep border radii restrained, generally 6 to 10px. Avoid a page made entirely of pill shapes.
- Use a small grid or dotted technical pattern as a background detail only when it supports the product story.
- Do not use floating gradient orbs, bokeh blobs, or generic decorative blobs.

## Hero Composition

The hero should communicate the product instantly:

- Top navigation: Zyphora wordmark, `Features`, `Privacy`, `Updates`, and a compact `Download` action.
- Eyebrow: `A calmer way to browse`.
- H1: short, memorable, and product-centered. Example: `The web, with more room to think.`
- Supporting copy: explain that Zyphora is a privacy-focused desktop browser with tracker blocking, useful organization, and optional sync.
- Primary CTA: `Download for Windows` with a download icon.
- Secondary CTA: `See how privacy works` with an arrow icon.
- Add a small trust line beneath the CTA: `Local-first by default · Optional account · Automatic updates`.
- Product visual: a large, realistic Zyphora browser window with tabs, address bar, privacy indicator, sidebar, and a new-tab scene. It should be the dominant visual asset, not a tiny screenshot in a card.

The product visual should have stable dimensions and remain legible on mobile. On small screens, stack the text before the browser preview and crop nothing important.

## Browser Mockup Art Direction

Create a faithful browser interface mockup rather than an abstract dashboard:

- Deep ink title bar and a soft paper content area.
- Narrow tab strip with one active tab and a compact plus button.
- Address bar with a lock/privacy indicator and a realistic URL.
- Sidebar showing bookmarks, history, downloads, and settings icons.
- Main content showing a calm new-tab page with time, search, and a subtle landscape image.
- Include a small tracker-blocking status chip or panel with a believable count.
- Use Lucide icons if an icon library is available.
- Keep browser chrome geometry stable; no elements should jump when text changes.
- Use real bitmap photography for the new-tab landscape or another relevant product image. Do not make the main product visual a decorative SVG.

## Feature Section Visuals

### Privacy Section

Use a dark ink band with pale type and a bright citrus privacy marker. Show a compact browser permission or tracker panel beside copy about visible controls. The section should feel protective, not paranoid.

### Organization Section

Use a light paper background and a vertical composition of bookmarks, history, downloads, and password rows. Make the information dense enough to feel useful, but highly ordered.

### Performance Section

Use mineral blue as the dominant background with a simple diagram-like visual: active tab, sleeping tabs, and reduced background activity. Keep it clear and not overly infographic-like.

### Optional Sync Section

Use a split editorial layout with a device list and a small sync status indicator. Clearly label sync as optional. Avoid implying that browsing requires an account.

### Download Section

Use a strong dark band or mineral panel with one decisive CTA. Include current version, Windows requirement, installer size if known, and links to release notes and privacy details.

## Motion

Use motion to establish quality and hierarchy, not to decorate every element:

- Hero product preview fades and rises into place on load.
- Feature sections reveal with a short stagger as they enter the viewport.
- Browser tabs can gently change active state in a product preview.
- Privacy indicator can pulse once when it first appears.
- Buttons should have fast, restrained hover and press states.
- Respect `prefers-reduced-motion` and disable nonessential animation for those users.
- Avoid perpetual floating animations, noisy parallax, and scroll-jacking.

## Interaction Details

- Navigation remains readable and becomes compact after scrolling.
- Download buttons show a clear hover, focus, and downloading state.
- Feature navigation can use tabs or anchored sections, but avoid an oversized sticky UI.
- Tooltips are appropriate for unfamiliar icon-only controls.
- Icon-only controls must have accessible labels.
- Focus states should be visible using a citrus or mineral outline.
- Mobile navigation should be a real menu with open and close states.

## Accessibility And Responsiveness

- Meet WCAG AA contrast for body text and controls.
- Use semantic headings in a logical order.
- All interactive elements must be keyboard reachable.
- Never rely on color alone to communicate privacy, status, or errors.
- Ensure labels and buttons fit at 320px wide.
- Test at mobile widths around 390px and desktop widths around 1440px.
- Keep product screenshots and mockups from causing horizontal overflow.
- Use responsive constraints such as `aspect-ratio`, grid tracks, and min/max widths for fixed-format browser UI.

## Content Tone

Voice: confident, plainspoken, observant, and human.

Prefer:

- `See what is being blocked.`
- `Your tabs are useful. They should not be exhausting.`
- `Sync is available when you want it.`
- `Privacy controls you can actually understand.`

Avoid:

- `Revolutionary next-generation browsing ecosystem.`
- `Military-grade privacy.`
- `The ultimate browser for everyone.`
- Unverifiable speed or privacy claims.

## Do Not Build

- No generic purple SaaS landing page.
- No giant hero paragraph with no product visual.
- No dashboard-style card grid as the entire website.
- No fake testimonials, awards, usage numbers, or logos.
- No dark blurred hero image behind unreadable text.
- No excessive glassmorphism.
- No decorative orbs or bokeh.
- No rounded pill button for every action.
- No unexplained fake browser features.

## Final Quality Bar

The finished site should make a visitor understand within five seconds:

1. Zyphora is a desktop web browser.
2. It puts privacy controls in the user's hands.
3. It still has the practical features people expect from a modern browser.
4. There is a clear, trustworthy path to download it.

It should look memorable in a screenshot, remain useful on a phone, and feel credible enough that a visitor would trust installing the product.
