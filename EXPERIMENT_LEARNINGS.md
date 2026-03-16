# TicketHub Experiment Learnings

Findings from testing AI shopping agents against a configurable ticket marketplace. These learnings document how AI agents interpret, navigate, and make decisions on web-based e-commerce platforms under varying conditions.

This document feeds into a broader research effort on **agent interpretability of websites** — understanding what AI agents can and cannot perceive, how web architecture choices affect agent behavior, and what design patterns help or hinder autonomous agent interaction with the web.

Each finding follows a structured format: observation, controlled conditions, root cause analysis, and implications for both web design and agent development.

---

## Finding 1: Client-Side Rendering Creates a Total Visibility Barrier for Browsing Agents

**Date:** 2026-03-16
**Category:** Agent perception / Web architecture

**Observation:** An AI browsing agent was directed to TicketHub to find NBA ticket listings. The agent successfully resolved the URL, received an HTTP 200 response, and parsed the HTML — but reported seeing only a page title ("Find Your Perfect Event"), a search input, and the text "Loading events...". Zero event data was visible to the agent despite 15+ events being available.

**Controlled conditions:**
- Platform: Next.js 14 React application
- Rendering: Pure client-side — all data fetched via `useEffect` hooks after browser JavaScript execution
- Backend: Express.js API returning full JSON payloads (confirmed working via direct API calls)
- Agent type: Web-browsing agent (HTTP fetch, no JavaScript runtime)

**Root cause:** The server returned a minimal HTML shell containing React mounting points and bundled JavaScript references. All meaningful content (event names, dates, venues, prices) was populated by client-side JavaScript after `DOMContentLoaded`. The agent's HTTP client received the pre-hydration HTML, which contained no semantic content — only framework scaffolding and loading placeholders.

**Resolution:** Converted public-facing pages to Next.js server-side rendering (SSR). Server components now fetch data at request time and embed it in the initial HTML response. Client components still hydrate for interactivity (search, filters, cart operations), but the first-paint HTML contains all content.

**Analysis:**

This is not a partial degradation — it is a complete content blackout. The agent received a valid HTTP response with correct status codes and well-formed HTML, yet the page carried zero informational value. From the agent's perspective, the site appeared functional but empty. There was no error signal to indicate that content was missing; the "Loading events..." text could plausibly be the site's actual state.

This creates a critical distinction in agent capability:

| Agent type | Content access | Affected by CSR |
|---|---|---|
| Browsing agent (HTTP fetch) | HTML only | Fully blocked |
| Browsing agent (headless browser) | Rendered DOM | Unaffected |
| API agent (direct endpoint calls) | Raw JSON | Unaffected |

The majority of current AI browsing agents operate via HTTP fetch rather than headless browser execution, making this a widespread limitation.

**Implications:**

1. **SSR is a prerequisite for agent accessibility.** Any experiment involving browsing agents is untestable against CSR pages — the agent cannot enter the funnel at all, invalidating all downstream measurements (conversion, price sensitivity, dark pattern susceptibility).

2. **The web has a growing "dark matter" problem for agents.** As SPAs and CSR frameworks dominate modern web development, an increasing share of web content is invisible to non-JavaScript agents. This is not intentional obstruction — it is an architectural side effect with significant consequences for agent-web interaction.

3. **Two consumption channels demand parallel experiment design.** Browsing agents perceive rendered HTML (influenced by layout, text emphasis, visual hierarchy), while API agents perceive structured JSON (influenced by field names, nesting, score values). The same underlying data can produce different agent behaviors depending on the consumption channel. Experiments should control for this.

4. **Loading states are adversarial signals.** A loading spinner or "Loading..." text is semantically ambiguous — it could mean content is pending, the server is slow, or the page is broken. Agents have no reliable way to distinguish "wait for JavaScript" from "the content doesn't exist." This ambiguity may cause agents to silently fail (report no results) rather than retry or escalate.
