# ScouterBot Troop Inventory + Setup Wizard Implementation

## Steps

- [x] Read all existing files to understand architecture
- [x] Create TODO.md with implementation plan
- [x] Modify `manifest.json` — add GitHub API permissions
- [x] Create setup wizard overlay in `popup.html`
- [x] Add wizard styles to `popup.css`
- [x] Implement first-run detection + wizard flow in `popup.js`
- [x] Add inventory settings to `options.html`
- [x] Add inventory settings logic to `options.js`
- [x] Add GitHub API handlers to `background.js`
- [x] Create `backend/inventory_manager.py` — GitHub CRUD + calculations
- [x] Add inventory endpoints to `backend/server.py`
- [x] Update `backend/config.py` — inventory defaults
- [x] Update `README.md` — document inventory + wizard setup
- [x] Commit and push to repo

## What Was Built

### Setup Wizard (`popup.js` + `popup.html` + `popup.css`)
- **Step 1: Welcome** — Introduction to ScouterBot
- **Step 2: Backend Check** — Tests connection to localhost:8000, shows setup instructions if offline
- **Step 3: GitHub Decision Tree**
  - "Yes, connect now" → 4-step sub-flow: account check → repo creation → PAT creation → test & save
  - "Later" → Shows reminder, saves `setupComplete: true`
- **Step 4: Summary** — Shows what's connected, finishes setup
- First-run detection via `chrome.storage.sync.get('setupComplete')`
- Re-runnable via 🧙 Setup button (visible when inventory not connected)

### GitHub Integration (`background.js`)
- `TEST_GITHUB_CONNECTION` — Verifies repo access and creates `inventory.json` if missing
- `GET_INVENTORY` — Reads `inventory.json` from troop's GitHub repo
- `UPDATE_INVENTORY_ITEM` — Adds/edits items with automatic GitHub commit
- `RECORD_ORDER` — Updates `on_order`, appends to `pending_orders` with override tracking
- `parseRepoUrl()` helper — Extracts owner/repo from any GitHub URL
- `ensureInventoryFile()` — Creates initial `inventory.json` with empty structure

### Inventory UI (`popup.html` + `popup.js` + `popup.css`)
- **📦 Inventory button** in toolbar opens inventory modal
- Shows all items grouped by category (collapsible)
- Color-coded stock badges: 🟢 OK / 🟡 Low / 🔴 Out
- Search/filter items by name
- Add new items via form modal (name, category, stock levels, SKU, notes)
- Edit existing items inline
- **🛒 Order button** on each item opens recommendation modal
- Order modal shows calculation breakdown + override input + reason field

### Backend Inventory (`backend/inventory_manager.py` + `backend/server.py`)
- `InventoryManager.calculate_need()` — `needed = max(min_stock - available, approaching - available)`
- `format_inventory_for_llm()` — Converts inventory to text context for RAG chat
- `format_order_recommendation()` — Human-readable recommendation with calculation
- `get_low_stock_items()` — Returns all items below minimum stock
- `create_inventory_template()` — Starter template with common Scouting items
- API endpoints:
  - `POST /api/inventory/recommend` — Get recommendations for item/category/all
  - `GET /api/inventory/template` — Get starter template
  - `POST /api/inventory/order` — Record order with override tracking
- Chat endpoint updated to accept `inventory_context` and inject it into system prompt

### Settings (`options.html` + `options.js`)
- Added GitHub Repository URL field
- Added GitHub Personal Access Token field (password type)
- Added Troop Number field
- Added **Test GitHub** button that calls `TEST_GITHUB_CONNECTION`
- All fields save/load via `chrome.storage.sync`

### Manifest (`manifest.json`)
- Added `https://api.github.com/*` to `host_permissions`
- Added `https://advancements.scouting.org/*` to content scripts
- Version bumped to 1.1.0

## Wizard Flow

```
First Launch?
├── YES → Show Setup Wizard
│   ├── Step 1: Welcome to ScouterBot
│   ├── Step 2: Backend Connection Check
│   ├── Step 3: GitHub Inventory Integration?
│   │   ├── "Yes, connect now" → Guide through repo + token setup
│   │   └── "Later" → Skip, show reminder
│   └── Step 4: You're Ready!
└── NO → Show normal chat
```

## GitHub Integration Decision Tree

```
"Would you like to connect your troop's inventory to GitHub?"
├── [Connect Now]
│   ├── Step A: Do you have a GitHub account?
│   │   ├── No → "Create one at github.com/join, then come back"
│   │   └── Yes → Continue
│   ├── Step B: Create a new private repo (e.g., "Troop123-Inventory")
│   ├── Step C: Create a Personal Access Token (classic) with 'repo' scope
│   ├── Step D: Enter repo URL and token → Test connection
│   └── Step E: Success → Save settings
└── [Later]
    └── "You can connect anytime via Settings ⚙️ → Troop Inventory"
```

## Next Steps (Optional Enhancements)

- [ ] Integrate Scoutbook Plus API to auto-detect approaching advancements
- [ ] Add barcode scanning for quick inventory updates
- [ ] Email/webhook notifications when stock runs low
- [ ] Multi-troop support (switch between troops)
- [ ] Inventory import from ScoutShop.org CSV
- [ ] Firefox/Edge manifest compatibility
- [ ] Generate PNG icons from SVG placeholder

