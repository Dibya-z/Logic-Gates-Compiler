GATE: OPEN 19 (rounds used up)

# Design review notes

The presentation-site checker was run for three rounds. It did not pass. No checker files were changed and no findings were waived. The compiler workbench follows the user’s explicit editor/results layout; full-screen marketing sections, sales CTAs, decorative photographs and additional animated sections would conflict with that task.

Applicable observations produced changes to keyboard focus indicators, compile-shortcut contrast, phone controls, responsive circuit fitting and dropdown stacking. Real Chrome interaction checks and screenshots at 1440, 1024, 768 and 390 pixels passed. The checker also reported an incomplete runtime evaluation after a development-page navigation; this is not reported as a passing design check.

Visual direction: software workbench; graphite surfaces, lime signal accent, system sans plus monospace code; a compact title entrance and direct control feedback. The circuit is generated from real compiler data. No invented photographs, customer claims, sales forms or external visual assets are used.

## Open findings

| Check | Target | Reported finding |
| --- | --- | --- |
| hero-fill | div.app-shell > main.main-workbench > div.workbench-grid > aside.source-column "Source code" | the next section shows on the first screen: it starts at 225px on a 900px screen (the hero ends at 195px) |
| flush | div.workbench-grid > aside.source-column > button.keyboard-tip > span "New to LogicHDL? Read the guide" | its button sits 8px above the lower edge of aside.source-column, where the ground changes to section.results-column |
| flush | div.workbench-grid > section.results-column > div.pipeline-heading > span.small-label "COMPILATION PIPELINE" | its first line sits 2px under the top edge of section.results-column, where the ground changes |
| nav | div#root > div.app-shell > header.app-header > a.brand "logi—compile. v1.0" | nav link wraps to a second line |
| cta | div#root > div.app-shell > main.main-workbench > section.diagnostics-panel.panel "Diagnostics 0 0 All checks passed No err" | the last section before the footer ends with no button |
| copy-headline | main.main-workbench > div.workspace-heading > div:nth-of-type(1) > h1 "Logic, made visible." | "Logic, made visible." does not name what is sold (logichdl compiler workbench, logichdl, compiler, workbench, from flags) |
| copy-actions | div.workspace-heading > div.workspace-actions > div.export-dropdown > button.button.subtle "Export" | 3 actions in the hero ("AI assistant", "Share", "Export"); at most 2 |
| off-grid | main.main-workbench > div.workspace-heading > div:nth-of-type(1) > div.eyebrow "LOGICHDL COMPILER WORKBENCH" | left edge at 58px, 19px off the page margin at 39px (10 elements, like h1) |
| off-grid | div.workbench-grid > section.results-column > div.phase-footnote > span:nth-of-type(1) "Deterministic compiler. Hand-written pha" | left edge at 559.5px, 19.5px off a common edge of its section at 540px (3 elements) |
| section-tile | div#root > div.app-shell > main.main-workbench > div.workspace-heading "Logic, made visible." | the header and the first section fill 195px (0.22 screens at 1440x900; the section is 90px), shorter than the screen: the first screen shows 90px of it and 675px of the next section, its heading "Source code" on screen |
| section-tile | div#root > div.app-shell > main.main-workbench > div.workbench-grid "Source code" | the section is 795px tall (0.88 screens at 1440x900), shorter than the screen: its tile (the screen from its top) shows 795px of it and 84px of the next section ("Diagnostics 0 0 All checks pas"), its picture on screen |
| section-tile | div#root > div.app-shell > main.main-workbench > section.diagnostics-panel.panel "Diagnostics 0 0 All checks passed No err" | the section is 94px tall (0.10 screens at 1440x900), shorter than the screen: its tile, held at the page's end (scroll 293px) shows 94px of it and 728px of the section above, its heading "Watch the compiler think" on screen |
| focus-visible | section#source-panel > div.source-title:nth-of-type(1) > label.sample-select > select "Load sample program" | Tab stop 10, select "Load sample program": the focus lands on something you cannot see |
| focus-visible | div.code-editor:nth-of-type(3) > div.cm-editor.cm-focused > div.cm-scroller:nth-of-type(2) > div.cm-content:nth-of-type(2) "LogicHDL source code" | Tab stop 11, div "LogicHDL source code": it shows no change when focused |
| moment-none | (the page) | a software page (--type) deals no moment: every kind carries one, two on a long page (moments.md) |
| flush | main.main-workbench > div.workspace-heading > div.workspace-actions > button.button.subtle:nth-of-type(1) "AI assistant" | its button sits 0px above the lower edge of div.workspace-heading, where the ground changes to aside.source-column |
| flush | section#source-panel "Source code Samples Custom program The L" | its first line sits 0px under the top edge of aside.source-column, where the ground changes |
| flush | main.main-workbench > div.workbench-grid > aside.source-column > section.teaching-card "Watch the compiler think Reveal tokens a" | its last line sits 0px above the lower edge of aside.source-column, where the ground changes to section.results-column |
| no-visual | div.app-shell > main.main-workbench > div.workbench-grid > aside.source-column "Source code" | no picture, effect or mock in this section; a feature section needs a visual |

The focus findings refer to the transparent native select inside its visibly outlined label and the CodeMirror editable region inside its outlined editor. The native editor remains keyboard operable. The layout findings apply presentation-page spacing rules to compact compiler panels; the documented workbench design is retained.

## Checker warnings

- **flush**: its last line sits 13px above the rule on top of section.diagnostics-panel.panel
- **flush**: its first line sits 15px under the top edge of section.diagnostics-panel.panel, where the ground changes
- **flush**: its last line sits 17px above the lower edge of section.diagnostics-panel.panel, where the ground changes to the footer
- **flush**: its first line sits 21px under the top edge of footer.app-footer, where the ground changes
- **fold-card**: the 863x635 card starts on the first screen and runs 85px past its bottom
- **copy-buttons**: "AI assistant" does not start with a verb (book, buy, try, start, get, see...) (and 2 more like it: "Share", "Export")
- **copy-actions**: the main action "Compile source" does not read word for word the same in the nav or hero and the closing section
- **centre-axis**: centred text 14px left of the middle of its box (1315px against 1329px)
- **section-gaps**: the sections overlap by 712px
- **section-gaps**: 48px between these sections, +26% against the median 38px
- **nav-family**: the nav's links come in 2 sizes (11, 13px)
- **stranded-action**: stands 744px across from the nearest text of its block ("Logic, made visible.") (and 1 more like it: "Share")
- **font-load**: "Inter" is asked for by the h1, the h2s and the body text but never loaded (no font link or @font-face loads it): it shows in its fallback
- **visual-caption**: a muted 8px line of 1 row sits 9px under the drawing (svg): it reads as a caption: "Input"; no caption or description under any image, render or visual (house rule)
- **share-meta**: the head lacks og:title, og:description, og:image, twitter:card: a shared link shows no picture or title of its own
- **hero-screen**: not measured at 1440px: the page did not load (navigate: net::ERR_CONNECTION_REFUSED)
- **section-height**: not measured at 1440px: the page did not load (navigate: net::ERR_CONNECTION_REFUSED)
- **section-air**: not measured at 1440px: the page did not load (navigate: net::ERR_CONNECTION_REFUSED)
- **one-section**: not measured at 1440px: the page did not load (navigate: net::ERR_CONNECTION_REFUSED)
- **one-heading**: not measured at 1440px: the page did not load (navigate: net::ERR_CONNECTION_REFUSED)
- **container-edges**: not measured at 1440px: the page did not load (navigate: net::ERR_CONNECTION_REFUSED)
- **row-lines**: not measured at 1440px: the page did not load (navigate: net::ERR_CONNECTION_REFUSED)
- **split-pair**: not measured at 1440px: the page did not load (navigate: net::ERR_CONNECTION_REFUSED)
- **flush**: its first line sits 19px under the top edge of footer.app-footer, where the ground changes
- **tap-size**: a 193x29px tap target: under the 44px a phone needs
- **tap-size**: a 103x32px tap target: under the 44px a phone needs
- **tap-size**: a 73x32px tap target: under the 44px a phone needs
- **tap-size**: a 96x32px tap target: under the 44px a phone needs
- **tap-size**: a 27x15px tap target: under the 44px a phone needs
- **tap-size**: a 326x35px tap target: under the 44px a phone needs
- **tap-size**: a 27x15px tap target: under the 44px a phone needs
- **tap-size**: a 20x30px tap target: under the 44px a phone needs
- **tap-size**: a 38x42px tap target (and 2 more like it on this screen): under the 44px a phone needs
- **tap-size**: a 356x42px tap target: under the 44px a phone needs
- **tap-size**: a 71x14px tap target: under the 44px a phone needs
- **off-grid**: the section's heading starts at 56px, 40px off the page margin (16px), and no other section starts there
- **copy-stat-strip**: stat strip x2
- **copy-numbered**: 6 step numbers
