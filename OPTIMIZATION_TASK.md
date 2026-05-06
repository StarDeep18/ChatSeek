# ChatSeek — Performance Optimization & Architecture Refinement Task

## Project Context

ChatSeek is a Chrome Extension (Manifest V3) that adds a VS Code-style search sidebar to ChatGPT conversations.

The project already works and includes:

* Sidebar UI injected into ChatGPT
* Search across messages
* Ranked search scoring
* Keyboard navigation
* Highlighted results
* chrome.storage.session caching
* Chat navigation detection
* Lazy-loaded message indexing

The current architecture is already clean and modular:

* `content.js` → DOM interaction, indexing, sidebar injection
* `sidebar.js` → UI controller
* `search.js` → pure search engine logic
* `sidebar.css` → styling/theme system
* `sidebar.html` → UI shell

DO NOT rewrite this architecture.

---

# Goal

Optimize performance and scalability while preserving existing UX and behavior.

The extension currently becomes slower on large conversations (200–500+ messages).

Your task is to improve search efficiency intelligently without introducing external dependencies or heavy complexity.

---

# Required Improvements

## 1. Fast Pre-Filter Layer (CRITICAL)

Current issue:
`search.js` scores every message in the conversation.

Implement a lightweight candidate filtering step BEFORE expensive scoring.

### Requirements

* Use lowercase `.includes()` matching
* Reduce the candidate set before ranking
* If zero candidates found:

  * fallback to a smaller recent subset
  * avoid scanning everything immediately

### Goal

Reduce the number of scored messages significantly.

---

## 2. Token Caching

Current issue:
queries repeatedly split message text into tokens.

During indexing in `content.js`:

Add:

```js
tokens = text.toLowerCase().split(/\s+/)
```

Store tokens inside each indexed message object.

Then in `search.js`:

* reuse cached tokens
* avoid repeated `.split()` operations

---

## 3. Dynamic Search Scope

Do not always scan the entire conversation.

### Requirements

* Prioritize recent messages
* Introduce configurable limits:

  * e.g. last 120 messages
* Fallback to larger scan only if needed

### Goal

Improve perceived search speed.

---

## 4. Ranking Improvements

Enhance the scoring system WITHOUT removing the existing logic.

Add:

* boost if message starts with query
* boost nearby query word grouping
* preserve:

  * exact phrase scoring
  * whole-word scoring
  * partial scoring
  * recency bonus

---

## 5. Maintain Existing UX

DO NOT break:

* highlighting
* snippet previews
* keyboard navigation
* sidebar interactions
* smooth scrolling
* theme sync

---

# Constraints

## DO NOT:

* Rewrite the entire extension
* Introduce external libraries
* Use ML models
* Use embeddings
* Use remote APIs
* Add unnecessary abstractions
* Break CSP compatibility
* Remove caching

---

# Expected Output

Provide ONLY changed files.

Clearly separate updated files:

* `search.js`
* `content.js`
* etc.

Keep code:

* readable
* modular
* production-quality

---

# Important Engineering Expectations

Think like a senior frontend engineer optimizing an already-working production extension.

Prioritize:

1. Performance
2. Maintainability
3. UX responsiveness
4. Minimal architectural disruption

Avoid overengineering.
