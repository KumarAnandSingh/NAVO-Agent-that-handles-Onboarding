# Demo video script

**Target length:** 4 to 5 minutes. **Format:** screen recording at 1080p with voice-over, uploaded to YouTube.

The video must show the key features and the user experience. Its most important proof is the agent loop: **Observe → Decide → Act → State change → Communicate.** Keep the UI moving, and let the runtime panel prove that the engine is real.

---

## Before recording

- [ ] Use the **hosted link**, or a local production build (`npm run build && npm start`).
- [ ] Set `ANTHROPIC_API_KEY`, so the runtime panel reads **"Claude live"** and Ask Navo answers with Claude.
- [ ] Use a browser window around **1600 × 1000** at 100% zoom. Hide bookmarks and close other tabs.
- [ ] Turn on Do Not Disturb. Use a quiet room and a decent microphone.
- [ ] Press **Reset** in the presenter panel, then reload so the intro brief shows.
- [ ] Recorder: OBS, QuickTime, Loom or Windows Game Bar (Win + G). Record 1080p at 30 fps.
- [ ] Rehearse once with the guided demo, using **→** to step at your own pace instead of auto-play.

---

## Script

| Time | Screen | Do | Say |
|---|---|---|---|
| **0:00** | Intro brief | Nothing; let it sit. | "Joining a large company means HR, IT, Facilities, a background check and your manager, each tracking their own piece. Nobody owns the chain, so a late item upstream quietly breaks Day 1. This is **Navo**, an AI onboarding agent for Halden, a fictional company. It owns the journey end to end." |
| **0:20** | Intro brief | Point at the four people and the "Watch for" card. | "We follow Anand, joining on Monday 19 October. Watch for one thing: his Employee ID is late, and his laptop, email and VPN all depend on it. Everything you'll see runs on a real agent engine with a simulated clock." |
| **0:35** | Launch → Meet Navo | Press **▶ Play guided demo**, then use **→** to step. | "Navo starts by setting its limits: what it does on its own, what it always asks first, and a promise that Anand can always see what it did and why." |
| **0:50** | Documents → Clarify | Step through the upload and the clarify screen. | "Navo has already read most of his documents. It asks for one missing address proof, then for one unreadable date on his relieving letter. It asks about that field only, not the whole document. Claude reads the image; deterministic rules decide whether it's verified." |
| **1:10** | Forms | Step. | "Forms come pre-filled from his documents. Only the emergency contact needs him." |
| **1:20** | Home, Thursday 09:17 · **runtime panel** | Step to the risk beat. **Pause.** Point at the tool calls on the right. | "Thursday, four days out. Navo's daily check wakes up. Here's what it actually ran: read the onboarding state, traced what depends on the Employee ID, calculated Day-1 risk (high, zero working days of slack), checked its permission, then reminded Priya in HR. It planned the next steps: escalate after 24 hours, and offer a loaner if the ID misses the last safe start." |
| **1:50** | Home, **Why?** | Step to "Every action has a reason". | "Anand sees the same reasoning in plain language, with the policy it relied on. He doesn't have to chase anyone." |
| **2:00** | HR owner console | Step (or press **H**). | "Priya sees only exceptions, not fourteen checklists. Navo has already reminded her and says what happens next." |
| **2:10** | HR → Generate ID → phone | Step. Point at the new tool calls. | "She issues the ID. Within a minute Navo raises the laptop, email and ID-card requests with IT and tells Anand the blocker is cleared." |
| **2:25** | Pickup → Day 1 → Confirm | Step through Ready and Day 1. | "By Friday everything is ready, and Navo books one pickup for the ID card, laptop and kit. On Day 1 he collects everything in one trip and confirms it; Navo closes the requests." |
| **2:45** | Week 1 → Benefits → Day 30 | Step. | "In week one Navo surfaces a health-cover deadline just before it matters, and books a walkthrough with his buddy in a free slot. At Day 30 the check-in is prepared." |
| **3:00** | Impact screen | Let it show. | "These figures are computed from this run: tasks Navo closed, how early it acted on the risk, and the audited tool calls." |
| **3:10** | Stage, **HR silent** | Close the outro. Choose **HR silent**, jump to **Pre-joining**, press **Advance time ▸** twice. | "Now the harder case: HR never replies. At the last safe moment Navo doesn't just order hardware. A loaner is an asset change, so it **asks Anand first**." Press **Approve**. "Approved: IT has a loaner ready for the Day 1 pickup, and Navo escalates to the HR Ops lead after 24 hours." |
| **3:40** | Ask Navo | Open **Ask Navo** and type *"What if HR doesn't respond?"* | "Ask Navo uses Claude with read-only tools over his live state and Halden's policies. It checked his follow-ups and the escalation policy, and it cites section 4.2. A citation is accepted only if that section was actually retrieved; otherwise Navo says it doesn't know." |
| **4:00** | GitHub: [Technical design](TECHNICAL_DESIGN.md#2-system-architecture) | Scroll the architecture diagram. | "Under the hood: one agent with 22 tools, each one validated, permission-checked, timed out and audited. Deterministic code owns dates, dependencies, risk and permissions; Claude handles language, reading and answers, and code verifies what it returns. Every Claude feature has an offline fallback." |
| **4:20** | Terminal or GitHub Actions | Show `npm test` passing, or the green CI run. | "122 unit and integration tests and 9 end-to-end tests, including both stories, failure cases and accessibility scans, at about 92% coverage." |
| **4:35** | Back to the stage | End on Navo's face. | "Navo does the coordinating. People make the decisions. **Navo: AI That Handles Onboarding.**" |

---

## If something goes wrong while recording

- **A step looks wrong:** press **←** to go back one step. The guided demo restores the chapter and replays to that point.
- **Claude is slow or the key is missing:** the answer falls back to Navo's rules and says so. That's fine to show, and you can mention it as a reliability feature.
- **Start over:** **Reset**, then reload.

---

## YouTube upload

- **Title:** Navo: AI That Handles Onboarding · Employee Onboarding Companion
- **Visibility:** **Public** or **Unlisted**. Both open without sign-in; don't use Private, which requires access to be granted.
- **Description:**

```
Navo is an AI onboarding agent for Halden (a fictional company). It tracks every onboarding
task and dependency, spots Day-1 risk early, acts within guardrails (reminders, IT requests,
escalation after 24h), asks the joiner before sensitive changes, and explains every action.

Track: Business Case #2: Employee Onboarding Companion
Code: https://github.com/KumarAnandSingh/new
Live demo: <hosted link>
Technical design: https://github.com/KumarAnandSingh/new/blob/main/docs/TECHNICAL_DESIGN.md

0:00 The problem
0:35 First launch and documents
1:20 Navo catches the late Employee ID
2:00 The HR owner's view
2:25 Day 1 and the first month
3:10 HR silent: asking before a loaner
3:40 Ask Navo with citations
4:00 Architecture and tests

All data is synthetic. Halden is fictional.
```

After uploading, paste the link into the README's **Demo video** row and into the submission email.
