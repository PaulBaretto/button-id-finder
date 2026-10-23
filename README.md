# Button ID Finder

A Chrome extension for the ads team: **click any button or link on a website and get its ID,
a clean CSS selector, and the exact Google Tag Manager trigger settings.** You don't need to ask a
developer or open DevTools.

<p align="center">
  <a href="https://github.com/PaulBaretto/button-id-finder/releases/latest/download/button-id-finder.zip"><img alt="Download latest version" src="https://img.shields.io/badge/%E2%AC%87%20Download-latest%20version-4f46e5?style=for-the-badge&logo=googlechrome&logoColor=white" height="44"></a>
  <br>
  <img alt="Latest version" src="https://img.shields.io/github/v/release/PaulBaretto/button-id-finder?label=version&color=111827">
</p>

## Watch how it works

https://github.com/user-attachments/assets/f6ebd426-e198-4a4b-9855-f949849fffb1

---

## Install (one time, about 2 minutes)

1. **[Download the latest version](https://github.com/PaulBaretto/button-id-finder/releases/latest/download/button-id-finder.zip)** (`button-id-finder.zip`) and unzip it
   (on Mac, double-click it). Move the `button-id-finder` folder somewhere permanent, like Documents.
   If you delete it, the extension stops working.
2. Open Chrome and go to **`chrome://extensions`**.
3. Turn on **Developer mode** (switch in the top-right corner).
4. Click **Load unpacked** and select the `button-id-finder` folder (the one that contains `manifest.json`).
5. Click the puzzle-piece icon in Chrome's toolbar and **pin** Button ID Finder so it's always visible.

### Updating to a new version
Download the latest ZIP again, unzip it, and replace the old `button-id-finder` folder with the new one (same place,
same name). Then go to `chrome://extensions` and click
the **↻ reload** icon on the Button ID Finder card.

---

## How to use it

### See button IDs by hovering (new in 1.1)
1. Open the website and click the **Button ID Finder** icon.
2. Click **Hover to see IDs**. (Shortcut: **Option + Shift + B** on Mac, **Alt + Shift + B** on Windows.
   To change it, go to `chrome://extensions/shortcuts`.)
3. Move your mouse over the page. Every button or link you point at shows a small box with its **ID**,
   the **best value to use** in GTM and its **reliability label**. No clicking needed.
4. Press **C** to copy the value of whatever you're pointing at.
5. **Click a button** to pin its full details in a panel (the click won't actually press the button or open the link):
   - **The best way to target it**, with a **Copy** button
   - A **reliability label**: Best / Good / OK / Risky
   - **Set it up in Google Tag Manager**: trigger type, condition and value to copy
6. You stay in hover mode while the panel is pinned. Keep hovering to check other buttons, or click another one to
   pin it instead. **Close details** (or ×) closes the panel and keeps hover mode on.
7. Press **Esc** or **Stop** to finish.

**The bar at the top in the way?** Just point at what's behind it: the bar fades out and the element underneath
is highlighted as normal. You can also drag the bar anywhere by its **⠿** handle (double-click the handle to put it back).

**Highlighted the wrong thing?** (For example the text inside a button instead of the whole button.)
Click it, then use **↑ Bigger area**.

### Get every button on a page
Click the icon, then **List every button on this page**. You can then:
- search and filter (Buttons / Links / Forms)
- click any row to see its full details
- **Download spreadsheet (CSV)**, or **Copy for Sheets** and paste into Google Sheets

### Keep a list across websites
In the details panel, click **Save to my list**. Your list is in the extension popup and works across pages and
sites. Download it as a CSV whenever you need to.

---

## What the reliability labels mean

| Label | Meaning | What to do |
|---|---|---|
| 🟢 **Best** | A permanent ID, or a phone/email link | Use it |
| 🟢 **Good** | A unique link address, tracking attribute or class | Fine to use |
| 🟠 **OK** | Works today but could break when the page is edited | Use it, and consider asking a dev for an ID |
| 🔴 **Risky** | Auto-generated ID or based on page layout | Click **Copy message for developer** and send it |

The **Copy message for developer** button writes the request for you: page, element and a suggested ID.

---

## Good to know

- **Embedded forms and booking widgets** (GoHighLevel, Jane, Calendly, etc. loaded in a frame) can't be tracked by
  the page's own GTM. The extension tells you when you've picked one of these.
- **First time using click triggers in GTM?** Go to **Variables → Configure** and tick all the **Clicks** boxes
  (and **Forms** for form triggers). Otherwise "Click ID", "Click URL" etc. won't appear in the dropdown.
- The extension only runs when you click it. It doesn't read or send anything in the background, and it
  has no access to sites until you use it on one.
- It won't work on Chrome's own pages (`chrome://…`) or the Chrome Web Store. Chrome blocks that.

## Practice page
Open `practice/practice-page.html` in Chrome to try it. To use the extension on local files, open
`chrome://extensions` → Button ID Finder → **Details** and turn on **Allow access to file URLs**.

---

### For developers
- Manifest V3, no dependencies. Permissions: `activeTab`, `scripting`, `storage`.
- Repo layout:
  - `extension/` is the extension itself (this is what Chrome loads). For local development, point **Load unpacked**
    at this folder.
  - `content/finder.js` is injected on demand and holds the selector engine and the UI (inside a Shadow DOM, so site
    CSS can't affect it).
  - `popup/` holds the toolbar popup and the saved list (`chrome.storage.local`, key `bif_saved`).
  - `practice/` is a practice page for training.
  - `media/` holds the demo video and its poster image.
  - `scripts/build.sh` + `.github/workflows/release.yml`: on every push to `main`, if the manifest version is new,
    GitHub builds `button-id-finder.zip` and publishes it as a Release.
- **Download link that always gives the latest version** (put this on the download page):
  `https://github.com/<owner>/button-id-finder/releases/latest/download/button-id-finder.zip`
- **Latest version number** (for showing on the download page):
  `https://api.github.com/repos/<owner>/button-id-finder/releases/latest` (the `tag_name` field)
- **To release a new version:** bump `"version"` in `extension/manifest.json`, then commit and push to `main`.
  Pushes without a version bump don't create a release.
