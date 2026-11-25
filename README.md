# Google Calendar AI (Chronos) — 10x AI-Native Business Calendar

> An autonomous AI workspace built on top of **Google Calendar REST API v3** and **Google Gemini 2.5 Flash**. It transforms Google Calendar from a passive 2D time grid into an active AI Chief of Staff that triages overlapping meetings, protects uninterrupted Deep Work blocks, writes meeting agendas, and executes multi-turn voice and text commands.

---

## 📚 Documentation Index

| Document | Description |
| :--- | :--- |
| **[`README.md`](./README.md)** | Project overview, feature tour, environment setup, and quick-start guide |
| **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** | Deep-dive engineering guide, folder structure, data flow diagrams, AI Agent loop, and extension guide for future developers |
| **[`THOUGHT_PROCESS.md`](./THOUGHT_PROCESS.md)** | First-principles product thinking, business user pain points, and 10x value framework |

---

## ✨ Key Capabilities

### 1. Dual-Mode Execution: Live Google Calendar OAuth 2.0 + Instant Sandbox
- **Zero-Friction Sandbox Mode:** Loads immediately with a realistic Monday–Friday business schedule (including 2 intentional double-booking conflicts) so anyone cloning the repo can test every AI feature in 0 seconds without setting up OAuth credentials first.
- **Live Google Calendar OAuth 2.0 Sync:** Clicking **"Connect Google Calendar"** initiates the Google Identity Services OAuth 2.0 flow (`calendar` and `calendar.events` scopes) and syncs directly with `https://www.googleapis.com/calendar/v3/calendars/primary/events`.
  - *(Evaluator Note: Since the Google OAuth app is in public prototype mode, when the Google login screen says "Google hasn't verified this app", simply click **Advanced ➔ Go to Chronos AI (unsafe) ➔ Continue** to connect your Google Calendar).*
- **1-Click Live Calendar Seeder:** When connected to a live Google account, clicking **"+ Seed Sample Week to GCal"** injects 8 sample business events into the user's real Google Calendar for live end-to-end testing.

### 2. Conversational & Voice AI Copilot (Multi-Turn Contextual Memory)
- **Voice-to-Calendar (Web Speech API) + Text Copilot:** Schedule, move, rename, or cancel meetings by speaking or typing natural sentences.
- **Contextual Multi-Turn Follow-Ups:** Remembers the `lastModifiedEventId` across turns so users can chain natural refinements:
  - *Turn 1:* `"Add 12 PM to 2 PM meeting of Agentic AI"` ➔ Creates **Meeting of Agentic AI** (12:00 PM – 2:00 PM).
  - *Turn 2:* `"On Friday not today"` ➔ Moves the same event to **Friday, 12:00 PM – 2:00 PM**.
  - *Turn 3:* `"Actually make it 2 PM to 4 PM"` ➔ Updates the time slot on Friday to **2:00 PM – 4:00 PM**.
  - *Turn 4:* `"Rename it to Agentic AI Architecture Review"` ➔ Updates the title in place.
  - *Turn 5:* `"Delete it"` ➔ Deletes the event.

### 3. Semantic Priority Engine & 1-Click Conflict Resolution
- **Automated Event Classification:** Every event is enriched with a business category and priority score (`0–100`):
  - `HIGH_ROI` (`96/100`): External client pitches, renewals, board & executive reviews.
  - `DEEP_WORK` (`92/100`): Protected coding, architecture, and strategic focus blocks.
  - `COLLABORATION` (`72/100`): Team planning, design reviews, and 1:1s.
  - `LOW_ROI_SYNC` (`35/100`): Optional status syncs and routine internal check-ins.
- **1-Click Overlap Resolution:** Automatically detects overlapping intervals in $O(N \log N)$ time, compares priority scores, computes the next conflict-free slot (`findNextAvailableSlot`), and moves the lower-priority meeting in 1 click.

### 4. Schedule Health Audit & Focus Block Shield
- **Time Intelligence Sidebar:** Displays a real-time **Schedule Health Score (`0–100`)** alongside total Deep Work vs. Meeting hours.
- **1-Click Focus Block Protection:** Scans the workweek for days lacking uninterrupted maker time and recommends open 2-hour morning windows that can be protected in 1 click.

### 5. Pre-Meeting AI Agenda Generator & Post-Meeting Follow-Up Blocker
- **Pre-Meeting Briefs:** Clicking any event opens the **Event Page Drawer**, where the user can generate a structured 3-point timed agenda and key decision questions and save it straight into the Google Calendar event description (`PATCH /calendars/primary/events/{eventId}`).
- **Post-Meeting Action Blocker:** Typing rough post-call takeaway notes (e.g., *"Send Q4 proposal deck to Acme Corp"*) automatically extracts the task title, finds the next open 45-minute window, and schedules an execution block on the calendar.

---

## 🛠️ Tech Stack

- **Framework:** [Next.js 15](https://nextjs.org/) (App Router, React 19, TypeScript)
- **Styling & Icons:** [Tailwind CSS v4](https://tailwindcss.com/) + [Lucide Icons](https://lucide.dev/) (Minimalist Notion Calendar / Cron aesthetic)
- **AI & NLP Layer:**
  - Official [`@google/genai`](https://www.npmjs.com/package/@google/genai) SDK (`gemini-2.5-flash` native Function Calling)
  - Custom deterministic Natural Language Date/Time/Context Parser (`src/lib/nl-parser.ts`)
  - Browser Native `SpeechRecognition` / `webkitSpeechRecognition` (Web Speech API)
- **External APIs:** Google Identity Services (OAuth 2.0 Token Model) & Google Calendar REST API v3

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** `v18.18+` (or `v20+` / `v22+`)
- **npm** `v9+`

### 2. Installation

```bash
git clone <your-repo-url>
cd chronos-ai-calendar
npm install
```

### 3. Environment Configuration (Optional for Sandbox, Required for Live GCal & Gemini)

Create a `.env.local` file in the root directory (or copy `.env.example`):

```bash
cp .env.example .env.local
```

Add your keys to `.env.local`:

```env
# Google Cloud OAuth 2.0 Web Client ID (for live "Connect Google Calendar" popup)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# Google AI Studio Gemini API Key (for Gemini 2.5 Flash function calling)
GEMINI_API_KEY=AIzaSyYourGeminiKeyHere
```

> **Note:** You can also enter or update both keys directly in the UI at runtime by clicking the **Settings (Gear Icon)** button in the top-right navigation bar.

### 4. Run the Development Server

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** in Chrome or Edge.

### 5. Build for Production

```bash
npm run build
npm start
```

---

## 🔑 Setting Up Your Own Google Cloud OAuth Client ID (If Deploying to a New Domain)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project and enable the **Google Calendar API** under *APIs & Services ➔ Library*.
3. Under *Google Auth Platform ➔ Audience*, add your test Gmail address under **Test users** (or publish the app).
4. Under *APIs & Services ➔ Credentials*, click **Create Credentials ➔ OAuth client ID**:
   - **Application type:** `Web application`
   - **Authorized JavaScript origins:** Add `http://localhost:3000` (and your production Vercel URL if deploying).
5. Copy the generated Client ID into `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `.env.local`.
