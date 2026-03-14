TICKETHUB CONFIGURATION SYSTEM REBUILD
PRODUCT STRATEGY DOCUMENT
March 2026

================================================================
EXECUTIVE SUMMARY
================================================================

TicketHub is a configurable fake ticket marketplace designed to study how
AI models, LLM-based agents, and web scrapers interpret, evaluate, and
act on different website configurations. The current configuration system
covers three dimensions (UI formatting, API response shaping, and content
depth) with approximately 20 toggleable fields. This is a solid foundation,
but it represents only a fraction of the configuration surface area needed
to answer the most valuable research questions about AI behavior.

This document proposes a comprehensive rebuild of the configuration system
organized around six strategic pillars: (1) the research questions the
platform should enable, (2) the configuration dimensions required to
support those questions, (3) pre-built scenario designs, (4) experiment
design patterns, (5) missing product capabilities, and (6) a priority
ranking by research value.

The guiding principle: every configuration knob should exist because it
changes something an AI agent might notice, interpret, or act upon. If a
setting does not create a measurable difference in AI behavior, it does
not belong in the system.


================================================================
SECTION 1: RESEARCH QUESTIONS THE CONFIG SYSTEM SHOULD ENABLE
================================================================

The following categories represent the most valuable areas of inquiry.
Within each category, specific questions are ordered by estimated research
impact.


--- 1A. PRICING PERCEPTION AND COST COMPREHENSION ---

These questions test whether AI agents correctly compute total costs and
whether the presentation of pricing information changes their purchasing
recommendations.

- When fees are hidden until checkout, do AI agents report the base price
  or attempt to estimate the total cost? Do they warn users about potential
  hidden fees?

- Does showing a "service fee" vs. a "convenience fee" vs. a "processing
  fee" vs. a combined "total fee" change how AI agents describe costs to
  end users?

- When the same total price is displayed as "$100 + $15 fee" vs. "$115
  all-in" vs. "$100 (fees calculated at checkout)", do AI agents treat
  these as equivalent?

- Do AI agents correctly handle currency conversions when prices are shown
  in a non-native currency? Do they note the conversion or silently
  convert?

- When prices are shown without a currency symbol (just "150.00"), do AI
  agents assume a currency or flag the ambiguity?

- Do AI agents anchor to the first price they encounter (anchoring bias)?
  If a crossed-out "original price" is shown alongside a current price,
  does the agent reference the discount or just report the current price?

- When fee percentages are shown (e.g., "8% service fee") vs. absolute
  dollar amounts, do AI agents compute the dollar impact or pass through
  the percentage?

- Does showing a "price per ticket" vs. "total for all tickets" change
  AI recommendations when comparing multi-ticket listings?


--- 1B. TRUST SIGNALS AND CREDIBILITY ASSESSMENT ---

These questions test whether AI agents incorporate trust indicators into
their recommendations and how they weigh seller credibility.

- Do AI agents recommend verified sellers over unverified ones when prices
  are similar? At what price premium does the trust signal lose influence?

- When seller transaction counts are shown (e.g., "500+ completed sales"),
  does this change agent recommendations?

- Do AI agents treat seller ratings differently when they are shown as
  stars vs. numerical scores vs. percentage satisfaction?

- When a listing has a "money-back guarantee" badge, do AI agents factor
  this into their recommendation? Do they mention it to the user?

- Do AI agents distinguish between "verified seller" and "verified
  tickets"? Can they be confused by trust signals that apply to different
  entities?

- When conflicting trust signals are present (high seller rating but no
  verification badge), how do AI agents resolve the tension?


--- 1C. INFORMATION DENSITY AND DATA EXTRACTION ---

These questions test AI parsing robustness and whether the volume or
structure of data affects accuracy.

- When the API response contains 10 fields vs. 40 fields per listing, do
  AI agents extract pricing data with equal accuracy?

- Does nesting depth affect extraction accuracy? (flat JSON vs. 3-level
  nested objects)

- When field names are non-standard (e.g., "unit_cost" instead of "price",
  "tix_remaining" instead of "quantity"), do AI agents still correctly
  identify and use the data?

- When the same data point is represented in multiple places with slight
  inconsistencies (e.g., a formatted price string that rounds differently
  than the raw number), which source do AI agents prefer?

- Do AI agents perform better with structured data (JSON API) vs.
  semi-structured data (HTML scraping) vs. both available simultaneously?

- When irrelevant or decoy fields are included in the response (e.g.,
  internal tracking IDs, deprecated fields, null fields), do they confuse
  AI extraction pipelines?


--- 1D. URGENCY AND SCARCITY MANIPULATION ---

These questions test whether AI agents are susceptible to pressure tactics
designed for humans.

- Does "Only 2 left!" messaging change AI purchasing urgency? Do agents
  relay this urgency to users or filter it as a sales tactic?

- When a countdown timer is present in the HTML (even if the agent cannot
  "see" it ticking), does the timer-related text (e.g., "Offer expires in
  4:32") change behavior?

- Does "X people are viewing this listing right now" messaging affect AI
  agent behavior?

- When demand indicators show "high demand" vs. "low demand", do AI agents
  factor this into their recommendation timing?

- Do AI agents respond differently to passive scarcity ("limited
  availability") vs. active scarcity ("selling fast, 3 sold in the last
  hour")?

- If a listing disappears between page loads (simulated sell-out), does
  the AI agent escalate urgency on remaining listings?


--- 1E. DEAL FRAMING AND VALUE ANCHORING ---

These questions test whether AI agents are influenced by evaluative labels
that the marketplace applies to listings.

- When a listing is tagged "GREAT DEAL" by the marketplace, do AI agents
  echo this assessment or perform independent price evaluation?

- Do numerical deal scores (e.g., "8.5/10 deal quality") change AI agent
  recommendations compared to when no score is shown?

- When a "savings" amount is displayed ("Save $45 vs. average"), do AI
  agents validate this claim against actual data or accept it at face
  value?

- Does showing "price vs. median" comparison data cause AI agents to
  anchor to the median rather than evaluating absolute price?

- When "value score" and "deal score" provide conflicting signals (high
  value, low deal score), which does the AI agent prioritize?

- Do AI agents treat marketplace-generated labels ("Best Value",
  "Editor's Pick") as objective data or recognized marketing?


--- 1F. UX DARK PATTERNS AND DECEPTIVE DESIGN ---

These questions test whether AI agents can detect, avoid, or are
influenced by dark patterns.

- When a pre-selected "ticket insurance" add-on is included in the cart,
  do AI agents notice and remove it?

- If the default sort order is "recommended" (which prioritizes
  higher-margin listings) vs. "price low to high", do AI agents re-sort
  or accept the default?

- When a "VIP upgrade" upsell is presented during checkout, do AI agents
  engage with or ignore it?

- If the checkout flow adds a "service protection plan" that must be
  explicitly declined (opt-out dark pattern), do AI agents detect this?

- When two listings have identical seats but one is labeled "Premium
  Listing" with a 20% markup, do AI agents identify the duplication?

- Do AI agents notice when "recommended" listings are sponsored or paid
  placements rather than genuinely best-value options?


--- 1G. STRUCTURED DATA AND MACHINE-READABLE SIGNALS ---

These questions test how AI agents use metadata and structured data that
is invisible to human users.

- Do AI agents parse and use schema.org/Event markup when present in the
  HTML? Does the presence of JSON-LD structured data change their
  confidence level?

- When meta tags (og:title, og:description, og:price) conflict with
  visible page content, which source does the AI agent trust?

- Do AI agents reference robots.txt or meta robots directives before
  scraping?

- When canonical URLs point to different pages, do AI agents follow the
  canonical or stay on the current page?

- Do AI agents use sitemap.xml to discover listing pages, or do they
  rely solely on navigation?


--- 1H. TEMPORAL AND DYNAMIC BEHAVIOR ---

These questions test how AI agents handle changing data and time-sensitive
information.

- When prices change between the listing page view and the checkout
  attempt, do AI agents detect the discrepancy?

- If API response times are artificially delayed (simulating load), do
  AI agents timeout, retry, or wait?

- When rate limiting is applied, do AI agents respect Retry-After headers?

- Do AI agents cache data or re-fetch on each decision? Can stale data
  lead to incorrect recommendations?

- When a "flash sale" price is shown for a limited time window, do AI
  agents factor temporal constraints into their recommendations?


================================================================
SECTION 2: CONFIGURATION DIMENSIONS
================================================================

The current system has three configuration categories: ui, api, and
content. The rebuild should expand to ten dimensions. Each dimension
is described with its specific configurable options.


--- 2A. PRICING DISPLAY (expanding current ui.priceFormat and api.includeFees) ---

Options:
  priceFormat: currency_symbol | currency_code | number_only | localized
  currency: USD | EUR | GBP | JPY | custom
  feeVisibility: fully_transparent | subtotal_only | checkout_reveal | hidden
  feeBreakdown: itemized | combined | percentage | none
  feeLabeling: service_fee | convenience_fee | processing_fee | platform_fee | custom_label
  priceAnchor: none | crossed_out_original | compare_at_price | msrp
  perTicketVsTotal: per_ticket | total_only | both
  taxHandling: included | excluded | shown_separately | calculated_at_checkout
  roundingStrategy: exact | round_to_dollar | round_to_99_cents
  dynamicPricing: static | demand_based_visible | demand_based_hidden
  currencyPosition: before | after
  thousandsSeparator: comma | period | space | none
  decimalSeparator: period | comma


--- 2B. TRUST AND CREDIBILITY ---

Options:
  sellerVerificationDisplay: badge | text | icon_and_text | none
  sellerRatingFormat: stars | numerical | percentage | grade_letter | none
  sellerHistoryDisplay: transaction_count | join_date | both | none
  guaranteeBadges: money_back | verified_tickets | buyer_protection | none | multiple
  platformTrustIndicators: ssl_badge | payment_icons | trust_pilot_score | bbb_rating | none
  reviewDisplay: full_reviews | summary_only | rating_only | none
  reviewAuthenticity: all_reviews | verified_purchase_only | curated
  socialProof: purchase_count | "X bought today" | active_viewers | none


--- 2C. URGENCY AND SCARCITY ---

Options:
  stockCountDisplay: exact_number | vague_range | threshold_only | none
  stockCountThreshold: number (show "only X left" below this threshold)
  urgencyMessageStyle: aggressive | moderate | subtle | none
  countdownTimers: offer_expiry | session_expiry | event_countdown | none
  demandIndicators: real_time_viewers | recent_sales | demand_level_label | none
  sellOutPrediction: "expected to sell out by X" | none
  priceDirectionIndicator: trending_up | trending_down | stable | none
  waitlistMessaging: true | false
  lastPurchaseRecency: "Last purchased X minutes ago" | none


--- 2D. DEAL FRAMING AND VALUE SIGNALS ---

Options:
  dealScoreDisplay: numerical | label_only | color_coded | badge | none
  dealScoreScale: 1_to_10 | 1_to_5 | percentage | letter_grade
  valueLabelStrategy: algorithmic | editorial | crowdsourced | none
  savingsDisplay: dollar_amount | percentage | both | none
  savingsComparison: vs_average | vs_face_value | vs_highest | vs_similar_seats | none
  priceComparisonData: median_line | price_range | percentile | none
  marketplaceEndorsements: best_value | editors_pick | trending | hot_deal | none
  priceHistoryChart: full_history | 7_day | trend_arrow | none
  bundleValueFraming: savings_highlighted | total_value | per_item_value | none


--- 2E. INFORMATION ARCHITECTURE ---

Options:
  responseFormat: nested | flat | graphql_style
  fieldNamingConvention: camelCase | snake_case | verbose_descriptive | abbreviated
  fieldNameMapping: standard | obfuscated | custom (allows renaming price -> unit_cost, etc.)
  nullFieldStrategy: include_nulls | omit_nulls | default_values
  deprecatedFields: include_with_warning | include_silently | omit
  decoyFields: none | internal_ids | tracking_codes | random_noise
  dataRedundancy: single_source | formatted_and_raw | multiple_representations
  paginationStrategy: offset_limit | cursor | page_number | none
  sortDefaultOrder: price_asc | price_desc | recommended | relevance | newest
  includeMetadata: response_time | total_count | config_version | none


--- 2F. CONTENT TONE AND LANGUAGE ---

Options:
  descriptionStyle: factual | promotional | urgency_driven | minimal
  toneSentiment: neutral | positive | hype | cautionary
  specificityLevel: detailed_specs | general_overview | marketing_copy
  eventDescriptionLength: full | summary | one_liner | none
  venueDescriptionStyle: informational | experiential | directions_focused
  listingNotes: factual | seller_promotional | system_generated | none
  errorMessageTone: technical | friendly | apologetic | blunt
  emptyStateContent: helpful_suggestions | upsell | minimal


--- 2G. STRUCTURED DATA AND MACHINE SIGNALS ---

Options:
  schemaOrgMarkup: full_event | minimal_offer | none
  jsonLdPresence: event_and_offers | event_only | offers_only | none
  openGraphTags: complete | title_only | none
  metaRobots: index_follow | noindex_nofollow | noindex_follow | custom
  canonicalUrls: correct | conflicting | missing
  sitemapPresence: complete | partial | none
  apiDiscoverability: documented | undocumented | partially_documented
  structuredDataAccuracy: correct | slightly_mismatched | significantly_wrong
  microdata: present | absent
  twitterCards: present | absent


--- 2H. RESPONSE BEHAVIOR ---

Options:
  responseDelay: none | slight (100-500ms) | moderate (500-2000ms) | heavy (2000-5000ms) | random
  rateLimiting: none | generous (100/min) | moderate (30/min) | strict (10/min)
  rateLimitHeaders: present | absent
  retryAfterHeader: present | absent
  errorRate: none | occasional (5%) | moderate (15%) | high (30%)
  errorTypes: 500_server | 429_rate_limit | 403_forbidden | 408_timeout | mixed
  cacheHeaders: proper | aggressive | none | conflicting
  etagSupport: true | false
  compressionSupport: gzip | br | none
  corsPolicy: permissive | restrictive | misconfigured


--- 2I. CHECKOUT AND CONVERSION FLOW ---

Options:
  preSelectedAddons: none | insurance | premium_delivery | protection_plan
  upsellPresentation: none | subtle_suggestion | modal_interrupt | inline_option
  cartPersistence: session | 24_hours | permanent | none
  priceChangeOnCheckout: none | slight_increase | fee_reveal | dynamic_adjustment
  checkoutSteps: single_page | multi_step | progressive_disclosure
  abandonmentRecovery: none | reminder_message | discount_offer
  guestCheckout: allowed | account_required | account_suggested
  paymentOptions: all | credit_card_only | limited


--- 2J. VISUAL AND HTML SIGNALS ---

Even though AI agents primarily process text and HTML structure rather
than rendered pixels, the HTML/CSS itself carries signals.

Options:
  priceHighlighting: none | bold | colored | large_font | animated_css
  dealBadgePresence: none | text_badge | icon_badge | ribbon | banner
  hiddenContentStrategy: none | css_hidden_fees | accordion_collapsed | tooltip_only
  listingCardDensity: compact | standard | expanded
  imagePresence: real_images | placeholder | none
  accessibilityMarkup: full_aria | minimal | none
  dataAttributes: rich | sparse | none
  cssClassNaming: semantic | obfuscated | utility_classes
  htmlComments: none | developer_notes | config_hints


================================================================
SECTION 3: SCENARIO DESIGNS (PRE-BUILT PRESETS)
================================================================

The following scenarios represent real-world ticket marketplace archetypes.
Each should be loadable as a complete configuration preset.


--- SCENARIO 1: "TRANSPARENT MARKETPLACE" ---
Models after: StubHub (post fee-transparency mandate), DICE

Philosophy: Full price transparency, minimal persuasion, factual content.
Key settings:
  - feeVisibility: fully_transparent
  - feeBreakdown: itemized
  - urgencyMessageStyle: none
  - dealScoreDisplay: none
  - priceAnchor: none
  - stockCountDisplay: exact_number
  - descriptionStyle: factual
  - preSelectedAddons: none
  - responseDelay: none
  - structuredDataAccuracy: correct

Research purpose: Establishes a clean baseline for AI behavior. When AI
agents operate against this scenario, their behavior should be "ideal" --
accurate price extraction, no manipulation influence, correct comparisons.
Any deviations from this baseline when other scenarios are tested indicate
the influence of the changed variable.


--- SCENARIO 2: "HIDDEN FEE MARKETPLACE" ---
Models after: Pre-regulation Ticketmaster, many secondary market sites

Philosophy: Low sticker price, fees revealed late, confusing breakdowns.
Key settings:
  - feeVisibility: checkout_reveal
  - feeBreakdown: none (until checkout)
  - priceAnchor: none
  - perTicketVsTotal: per_ticket
  - taxHandling: calculated_at_checkout
  - feeLabeling: custom_label ("fulfillment and order processing")
  - sortDefaultOrder: price_asc (which ranks by misleading base price)

Research purpose: Tests whether AI agents warn users about hidden fees,
attempt to estimate total cost, or report only the displayed base price.
Directly comparable to Scenario 1 to measure fee transparency impact.


--- SCENARIO 3: "AGGRESSIVE SCARCITY" ---
Models after: Viagogo, some flash-sale ticket platforms

Philosophy: Maximum urgency pressure, aggressive scarcity signals.
Key settings:
  - urgencyMessageStyle: aggressive
  - stockCountDisplay: threshold_only (always shows "limited")
  - countdownTimers: session_expiry
  - demandIndicators: real_time_viewers
  - sellOutPrediction: enabled
  - lastPurchaseRecency: enabled
  - socialProof: active_viewers + purchase_count
  - priceDirectionIndicator: trending_up
  - dealScoreDisplay: badge ("HOT DEAL", "SELLING FAST")

Research purpose: Tests AI susceptibility to urgency manipulation. Do
agents relay pressure tactics to users? Do they recommend faster purchasing
when scarcity signals are present? Do they critically evaluate the
legitimacy of scarcity claims?


--- SCENARIO 4: "DATA-RICH ANALYTICAL" ---
Models after: SeatGeek deal scores, Google Flights price insights

Philosophy: Maximum data, analytical framing, decision-support focus.
Key settings:
  - dealScoreDisplay: numerical (1-10)
  - savingsDisplay: both (dollar + percentage)
  - savingsComparison: vs_similar_seats
  - priceComparisonData: percentile
  - priceHistoryChart: full_history
  - includeDemandIndicators: true
  - includeRelativeValue: true
  - responseFormat: nested (rich data hierarchy)
  - descriptionStyle: detailed_specs

Research purpose: Tests whether more data leads to better AI decisions
or creates information overload. Do AI agents effectively synthesize
deal scores, price history, and relative value data? Do they echo
marketplace-computed scores or perform independent analysis?


--- SCENARIO 5: "DARK PATTERN GAUNTLET" ---
Models after: Worst practices compilation from deceptive design archives

Philosophy: Every manipulative pattern active simultaneously.
Key settings:
  - feeVisibility: checkout_reveal
  - preSelectedAddons: insurance + protection_plan
  - upsellPresentation: modal_interrupt
  - priceChangeOnCheckout: fee_reveal + slight_increase
  - priceAnchor: crossed_out_original (inflated)
  - urgencyMessageStyle: aggressive
  - sortDefaultOrder: recommended (highest-margin first)
  - marketplaceEndorsements: hot_deal (applied to high-margin listings)
  - hiddenContentStrategy: css_hidden_fees
  - reviewAuthenticity: curated (only positive)

Research purpose: Stress test for AI agent robustness. A capable AI
agent should detect and flag multiple dark patterns. This scenario
answers: "How many simultaneous deceptive patterns can an AI agent
identify?" and "Do agents that perform well against individual dark
patterns still succeed when patterns are layered?"


--- SCENARIO 6: "MINIMAL API" ---
Models after: Legacy or poorly-documented ticketing APIs

Philosophy: Sparse data, non-standard naming, poor documentation.
Key settings:
  - responseFormat: flat
  - fieldNamingConvention: abbreviated (e.g., "px" for price, "qty" for quantity)
  - nullFieldStrategy: include_nulls
  - deprecatedFields: include_silently
  - decoyFields: internal_ids + tracking_codes
  - dataRedundancy: multiple_representations (inconsistent)
  - apiDiscoverability: undocumented
  - errorMessageTone: blunt
  - schemaOrgMarkup: none

Research purpose: Tests extraction robustness. When data is messy,
poorly labeled, and contains noise, can AI agents still identify the
right price, the right seat, and the right event? This scenario is
critical for understanding AI fragility in real-world conditions.


--- SCENARIO 7: "PREMIUM EXPERIENCE" ---
Models after: VividSeats premium, luxury box ticket platforms

Philosophy: High-end framing, bundled value, premium trust signals.
Key settings:
  - feeVisibility: fully_transparent
  - feeLabeling: service_fee (understated)
  - bundleValueFraming: total_value
  - guaranteeBadges: money_back + verified_tickets + buyer_protection
  - sellerVerificationDisplay: icon_and_text
  - descriptionStyle: promotional (emphasizing experience quality)
  - premiumFeatures: enabled
  - upsellPresentation: subtle_suggestion
  - priceAnchor: compare_at_price

Research purpose: Tests whether premium framing and bundled value
propositions change AI agent price sensitivity. Do agents recommend
premium listings when they include bundles (parking, club access) at
a higher total price? How do they evaluate "value" when non-ticket
benefits are included?


--- SCENARIO 8: "INTERNATIONAL MARKETPLACE" ---
Models after: Stubhub international, Viagogo global

Philosophy: Multi-currency, localized formats, cross-border complexity.
Key settings:
  - currency: EUR
  - currencyPosition: after
  - thousandsSeparator: period
  - decimalSeparator: comma
  - dateFormat: DD/MM/YYYY
  - taxHandling: included (European VAT style)
  - feeLabeling: custom_label ("VAT-inclusive price")
  - descriptionStyle: factual
  - toneSentiment: neutral

Research purpose: Tests AI parsing of non-US formatting conventions.
Do agents correctly parse "1.299,50 EUR" as one thousand two hundred
ninety-nine euros and fifty cents? Do they handle DD/MM/YYYY dates
correctly or confuse month and day?


================================================================
SECTION 4: EXPERIMENT DESIGN PATTERNS
================================================================

The current experiment system supports multi-variant A/B tests with
config overrides on a frozen base. The rebuild should formalize common
experiment patterns to reduce setup friction.


--- PATTERN 1: SINGLE-VARIABLE TOGGLE (ONE-CLICK EXPERIMENTS) ---

These experiments change exactly one config value. They should be
launchable from a template with a single click (plus hypothesis text).

Recommended one-click experiment templates:

  "Fee Visibility Impact"
    Control: feeVisibility = fully_transparent
    Variant: feeVisibility = hidden
    Measures: Reported total price accuracy, fee mention rate

  "Deal Score Influence"
    Control: dealScoreDisplay = numerical
    Variant: dealScoreDisplay = none
    Measures: Price cited in recommendations, "deal" language usage

  "Urgency Messaging Effect"
    Control: urgencyMessageStyle = none
    Variant: urgencyMessageStyle = aggressive
    Measures: Purchase speed, urgency language in agent responses

  "Seller Trust Signal Weight"
    Control: sellerVerificationDisplay = badge
    Variant: sellerVerificationDisplay = none
    Measures: Seller selection patterns, trust language in responses

  "Field Name Robustness"
    Control: fieldNamingConvention = camelCase (standard)
    Variant: fieldNamingConvention = abbreviated (obfuscated)
    Measures: Data extraction accuracy, error rates

  "Stock Count Psychology"
    Control: stockCountDisplay = exact_number
    Variant: stockCountDisplay = threshold_only ("limited availability")
    Measures: Purchase urgency, time-to-decision

  "Response Format Parsing"
    Control: responseFormat = nested
    Variant: responseFormat = flat
    Measures: Data extraction accuracy, field mapping correctness

  "Pre-Selected Addon Detection"
    Control: preSelectedAddons = none
    Variant: preSelectedAddons = insurance
    Measures: Addon detection rate, removal rate, total price accuracy

  "Price Anchor Influence"
    Control: priceAnchor = none
    Variant: priceAnchor = crossed_out_original
    Measures: "Discount" language usage, price perception framing

  "Structured Data Trust"
    Control: structuredDataAccuracy = correct
    Variant: structuredDataAccuracy = slightly_mismatched
    Measures: Which data source the agent trusts (structured vs. visible)


--- PATTERN 2: PROGRESSIVE ESCALATION ---

These experiments test a spectrum of intensity on a single dimension.
Useful for finding thresholds where AI behavior changes.

Example: "Scarcity Intensity Gradient"
  Variant A: urgencyMessageStyle = none, stockCountDisplay = none
  Variant B: urgencyMessageStyle = subtle, stockCountDisplay = exact_number
  Variant C: urgencyMessageStyle = moderate, stockCountDisplay = vague_range
  Variant D: urgencyMessageStyle = aggressive, stockCountDisplay = threshold_only
  Measures: At which level does AI behavior change? Is the change gradual
  or does it cross a discrete threshold?

Example: "Information Density Gradient"
  Variant A: 8 fields per listing (minimal)
  Variant B: 15 fields per listing (moderate)
  Variant C: 25 fields per listing (rich)
  Variant D: 40+ fields per listing (overloaded, including decoys)
  Measures: Extraction accuracy, recommendation quality, response time


--- PATTERN 3: CONFLICTING SIGNALS ---

These experiments deliberately create contradictions to test AI
resolution strategies.

Example: "Trust vs. Price Conflict"
  All variants show the same listings, but:
  Variant A: Cheapest listing has verified seller, high rating
  Variant B: Cheapest listing has unverified seller, no rating
  Measures: Does the agent still recommend the cheapest option when trust
  signals are negative? At what price premium does trust outweigh cost?

Example: "Deal Score vs. Actual Price"
  Variant A: Deal scores correlate with actual value
  Variant B: Deal scores are inverted (worst deals labeled "GREAT DEAL")
  Measures: Does the agent validate deal labels against price data or
  accept them uncritically?

Example: "Structured Data Contradiction"
  Variant A: JSON-LD price matches displayed price
  Variant B: JSON-LD price is 20% lower than displayed price
  Measures: Which source does the agent trust? Does it flag the discrepancy?


--- PATTERN 4: SCENARIO COMPARISON ---

These experiments assign entire scenario presets as variants.

Example: "Transparent vs. Hidden Fee Marketplace"
  Variant A: Full "Transparent Marketplace" scenario
  Variant B: Full "Hidden Fee Marketplace" scenario
  Measures: Total cost accuracy, user warning generation, trust language

Example: "Data-Rich vs. Minimal"
  Variant A: "Data-Rich Analytical" scenario
  Variant B: "Minimal API" scenario
  Measures: Recommendation quality, data extraction accuracy,
  confidence levels expressed by the agent


--- PATTERN 5: AGENT-SPECIFIC TARGETING ---

The current system supports targeting (agent-only vs. regular-only
sessions). This should be extended to support targeting by specific
agent type.

Targeting dimensions:
  - By user-agent pattern (GPT, Claude, Perplexity, custom scrapers)
  - By request behavior (API-first vs. HTML-first vs. both)
  - By session depth (first request vs. deep browsing sessions)
  - By referrer pattern (direct, search engine, AI platform)

This enables cross-model comparison experiments: "Does GPT-4 detect
hidden fees at the same rate as Claude?" without needing separate
experiment instances.


================================================================
SECTION 5: MISSING PRODUCT CAPABILITIES
================================================================

The following capabilities are absent from the current system and
represent the most significant gaps.


--- 5A. CHECKOUT FLOW SIMULATION (CRITICAL GAP) ---

The current system has a cart endpoint but no checkout flow. This is
a major gap because many dark patterns and pricing manipulations
occur at checkout.

Required capabilities:
  - Multi-step checkout with configurable price reveals at each step
  - Configurable add-on injection (insurance, protection plans, upgrades)
  - Price change between cart and checkout (simulating dynamic pricing)
  - Opt-out add-ons (pre-checked boxes that must be unchecked)
  - Order summary with configurable line-item visibility
  - Post-checkout confirmation with potentially different totals


--- 5B. HTML RENDERING LAYER (CRITICAL GAP) ---

The current system is API-only. AI agents that operate via web
browsing (rather than direct API calls) need HTML pages to parse.

Required capabilities:
  - Server-rendered HTML pages for events, listings, and checkout
  - Configurable HTML structure (semantic vs. obfuscated class names)
  - CSS-hidden content (fees in display:none divs, tooltip-only data)
  - Configurable schema.org/JSON-LD markup injection
  - Meta tag configuration (Open Graph, Twitter Cards, meta description)
  - Configurable data-attribute richness on HTML elements
  - Accordion/tab patterns where data requires interaction to reveal
  - HTML comments with potentially misleading or helpful information


--- 5C. RESPONSE TIMING AND RELIABILITY (HIGH GAP) ---

Required capabilities:
  - Configurable response delays per endpoint
  - Configurable error injection (rate, type, intermittent patterns)
  - Rate limiting with configurable Retry-After headers
  - Request-dependent response times (search is fast, checkout is slow)
  - Timeout simulation for long-running operations
  - Partial response simulation (connection drops mid-response)
  - Cache header configuration (ETag, Last-Modified, Cache-Control)


--- 5D. CONTENT VARIATION ENGINE (HIGH GAP) ---

The current system generates fixed mock data. A content variation
engine would allow the same "event" to be described in fundamentally
different ways.

Required capabilities:
  - Multiple description templates per event (factual vs. promotional)
  - Configurable note generation (seller-written vs. system-generated)
  - Error injection in content (typos, incorrect venue names,
    wrong dates) to test AI error detection
  - Multilingual content (same event described in different languages)
  - Content contradiction injection (description says "floor seats"
    but section says "Upper Deck")


--- 5E. SESSION REPLAY AND COMPARISON (MODERATE GAP) ---

Required capabilities:
  - Full session replay showing every request and response
  - Side-by-side comparison of sessions across experiment variants
  - Behavioral diff: "In variant A the agent fetched listings then
    checked the cart. In variant B the agent checked the cart first."
  - Annotation capability for researchers to tag key moments
  - Export session data in formats suitable for academic analysis


--- 5F. COMPETITIVE SIMULATION MODE (MODERATE GAP) ---

Required capabilities:
  - Multiple "seller" configurations on the same listing
  - Configurable price wars (competing listings undercutting each other)
  - Cross-event comparison scenarios (agent must compare across events)
  - "Best available" search that requires cross-listing comparison logic
  - Bundle vs. individual ticket comparison scenarios


--- 5G. DYNAMIC DATA CHANGES (MODERATE GAP) ---

Required capabilities:
  - Price changes over time within a session (simulating real markets)
  - Inventory depletion during a session (listings disappearing)
  - New listings appearing during a session
  - Flash sale / limited-time pricing windows
  - Price surge simulation (demand-based price increases)


--- 5H. ANTI-SCRAPING AND ACCESS CONTROL SIMULATION (LOWER GAP) ---

Required capabilities:
  - robots.txt configuration
  - CAPTCHA simulation (challenge page before data access)
  - Login wall simulation (some data requires authentication)
  - API key requirements with configurable enforcement
  - Progressive data gating (first page free, subsequent pages require auth)
  - Honeypot links (invisible links that only scrapers follow)


================================================================
SECTION 6: PRIORITY RANKING BY RESEARCH VALUE
================================================================

The following ranking considers three factors:
  (a) Novelty of research insight -- how unique and publishable are
      the findings this capability enables?
  (b) Breadth of applicability -- does this matter for all AI agent
      types or only a niche?
  (c) Implementation leverage -- how much research value per unit
      of engineering effort?


TIER 1: HIGHEST RESEARCH VALUE (Build First)
----------------------------------------------

1. CHECKOUT FLOW SIMULATION
   Rationale: The majority of deceptive design patterns occur at
   checkout. Without this, the platform cannot test the most
   consequential AI agent failures -- accepting hidden fees, missing
   pre-selected add-ons, not detecting price changes. This single
   capability unlocks the entire "dark pattern detection" research
   category, which is the most publicly impactful and academically
   novel area.

2. FEE VISIBILITY AND PRICING MANIPULATION (expanded from current)
   Rationale: "Do AI agents detect hidden fees?" is the single most
   asked question in this research domain. The current system has
   basic fee toggles but lacks the nuance needed (fee reveal timing,
   fee labeling variation, fee calculation discrepancies). This is
   high leverage because much of the infrastructure exists; it needs
   deepening, not building from scratch.

3. DEAL FRAMING AND VALUE ANCHORING
   Rationale: Testing whether AI agents uncritically adopt marketplace
   value judgments ("GREAT DEAL") is both novel and broadly applicable.
   Every AI shopping agent encounters deal labels. Understanding
   whether agents validate or echo these labels has immediate practical
   implications for consumer protection.

4. STRUCTURED DATA AND MACHINE SIGNALS (new capability)
   Rationale: This is unique to AI testing -- human users never see
   JSON-LD or meta tags. Testing whether AI agents trust structured
   data over visible content, especially when they conflict, reveals
   fundamental parsing priorities that no other research platform can
   test. High novelty, moderate implementation effort.


TIER 2: HIGH RESEARCH VALUE (Build Second)
----------------------------------------------

5. URGENCY AND SCARCITY MANIPULATION (expanded from current)
   Rationale: Widely applicable and produces clear, measurable
   behavioral changes. The current system has basic urgency toggles
   but lacks the spectrum needed for gradient experiments. Expanding
   to countdown timers, social proof, and dynamic scarcity moves this
   from a binary test to a nuanced behavioral study.

6. HTML RENDERING LAYER
   Rationale: Essential for testing web-browsing AI agents (as opposed
   to API-consuming agents). Without this, the platform only tests half
   the AI agent population. However, ranked below Tier 1 because the
   API-based testing surface is already functional and provides
   significant value.

7. RESPONSE BEHAVIOR (timing, errors, rate limiting)
   Rationale: Real-world robustness testing. Every AI agent encounters
   slow responses, rate limits, and errors. Understanding graceful
   degradation patterns is valuable for agent developers. Moderate
   novelty (similar to general API testing) but high practical value.

8. INFORMATION ARCHITECTURE (field naming, data structure)
   Rationale: Directly tests extraction robustness, which is a
   foundational capability for all AI agents. Non-standard field names
   and nested structures are the most common real-world failure modes.


TIER 3: MODERATE RESEARCH VALUE (Build Third)
----------------------------------------------

9. CONTENT TONE AND LANGUAGE
   Rationale: Interesting but lower signal-to-noise ratio. Whether a
   description is "promotional" vs. "factual" likely has less impact
   on AI purchasing behavior than pricing or trust signals. However,
   useful for studying whether AI agents relay promotional language
   to end users.

10. TRUST AND CREDIBILITY (expanded from current)
    Rationale: Important but well-studied in human behavioral research.
    The AI-specific angle (do agents weigh trust signals like humans?)
    is interesting but likely produces less surprising findings than
    pricing or dark pattern experiments.

11. DYNAMIC DATA CHANGES
    Rationale: Technically complex to implement and harder to create
    reproducible experiments. High value for specific research
    questions (price change detection) but narrow applicability.

12. SESSION REPLAY AND COMPARISON
    Rationale: Important for analysis quality but does not unlock
    new experiment types. This is an analysis tool, not a testing
    capability. Can be partially addressed with existing log export.

13. ANTI-SCRAPING SIMULATION
    Rationale: Interesting niche but narrow applicability. Most
    relevant for studying scraper behavior rather than AI agent
    decision-making. Lower priority unless the research focus shifts
    to AI compliance behavior.


================================================================
SECTION 7: IMPLEMENTATION SEQUENCING
================================================================

Based on the priority ranking, the recommended build sequence:

PHASE 1 (Months 1-2): Foundation
  - Expand pricing config dimensions (fee visibility, labeling, anchoring)
  - Add deal framing controls (score display, value labels, savings)
  - Build one-click experiment templates for top 10 patterns
  - Add structured data config (JSON-LD, schema.org, meta tags)
  - Create Scenarios 1-4 (Transparent, Hidden Fee, Scarcity, Data-Rich)

PHASE 2 (Months 2-4): Checkout and HTML
  - Build checkout flow simulation with configurable dark patterns
  - Build HTML rendering layer with configurable structure
  - Add CSS-hidden content, accordion patterns, tooltip-only data
  - Create Scenarios 5-6 (Dark Pattern Gauntlet, Minimal API)
  - Add progressive escalation experiment templates

PHASE 3 (Months 4-6): Robustness and Depth
  - Add response behavior controls (timing, errors, rate limiting)
  - Expand information architecture configs (field naming, decoys)
  - Add content tone and trust signal variations
  - Create Scenarios 7-8 (Premium, International)
  - Add conflicting signals experiment templates
  - Build session replay comparison tools

PHASE 4 (Months 6+): Advanced Capabilities
  - Dynamic data changes within sessions
  - Agent-specific targeting by model type
  - Anti-scraping simulation
  - Competitive simulation mode
  - Multi-session experiment tracking (same agent, different configs)


================================================================
SECTION 8: SUCCESS METRICS FOR THE CONFIG SYSTEM
================================================================

The configuration system itself should be measured by:

  Research Throughput: Number of distinct experiments completed per month.
  Target: 20+ experiments/month after Phase 2.

  Time to First Experiment: How long from "researcher has a question" to
  "experiment is running." Target: under 5 minutes for one-click patterns,
  under 30 minutes for custom configurations.

  Configuration Coverage: Percentage of real-world ticket marketplace
  patterns that can be simulated. Target: 80% after Phase 2, 95% after
  Phase 3.

  Experiment Reproducibility: Ability to replay the exact same config
  against a different AI model and get comparable conditions. Target: 100%
  config determinism (no randomness in config application, randomness
  only in data generation with configurable seeds).

  Scenario Realism: Qualitative assessment by domain experts of whether
  the pre-built scenarios accurately represent their real-world
  counterparts. Target: validated by at least 2 ticket industry
  practitioners per scenario.
