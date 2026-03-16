# Frontend Setup Guide

This document explains everything that was set up in the React frontend (`/frontend`) — what was done, why it was done, and how each piece works. Written in simple terms.

---

## What the Frontend Is

The frontend is a **React app** built with **Vite** (a fast development tool). It's what voters and admins see and interact with in their browser. It talks to:

- The **Flask backend** (via API calls using Axios)
- **Firebase** (for phone OTP login)
- **Ethereum smart contracts** (via MetaMask — deferred for now)

---

## 1. Tailwind CSS

### What it is
Tailwind is a CSS framework that lets you style things directly in your HTML/JSX using small utility classes like `bg-blue-500`, `text-sm`, `flex`, `p-4` — instead of writing separate CSS files.

### What was broken
The project had Tailwind installed but it wasn't actually working because:
- `tailwind.config.js` had `content: []` — meaning Tailwind didn't know which files to scan for class names, so it would generate an empty CSS file
- `index.css` was missing the three required `@tailwind` directives that inject Tailwind's styles into the app

### What was fixed

**`frontend/tailwind.config.js`** — told Tailwind where to look for class names:
```js
content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}']
```

**`frontend/src/index.css`** — added these three lines at the very top:
```css
@tailwind base;       /* resets default browser styles */
@tailwind components; /* allows custom component classes */
@tailwind utilities;  /* all the utility classes like flex, p-4, etc. */
```

**`frontend/postcss.config.js`** — this was already correct (had `tailwindcss` and `autoprefixer` listed as plugins).

---

## 2. Routing

### What it is
Routing means: when the user visits a URL like `/elections` or `/admin/login`, the app knows which page/screen to show — without doing a full page reload. This is called **client-side routing**.

### What was broken
`react-router-dom` was installed but never used. The app had no routes — it was still showing the default Vite counter demo screen.

### What was set up

**`frontend/src/main.jsx`** — wrapped the entire app in `BrowserRouter` (this is what enables routing), and also wrapped it in `AuthProvider` (explained below):
```jsx
<BrowserRouter>
  <AuthProvider>
    <App />
  </AuthProvider>
</BrowserRouter>
```

**`frontend/src/App.jsx`** — defines all the URL routes and which page component each one shows:

| URL | Page |
|-----|------|
| `/login` | Voter OTP login |
| `/admin/login` | Admin email/password login |
| `/` | Elections list (voter home) |
| `/elections/:id` | Election detail page |
| `/elections/:id/vote` | Vote casting page |
| `/results/:id` | Results & audit page |
| `/admin/elections` | Admin elections dashboard |
| `/admin/elections/new` | Create new election form |
| `/admin/elections/:id` | Admin election management |

The `:id` in a URL is a **dynamic segment** — it gets replaced with the actual election ID, e.g. `/elections/abc-123`.

---

## 3. Auth Context

### What it is
A **context** in React is a way to share data across all components without passing it down manually through every level. `AuthContext` holds the logged-in user's data and makes it available everywhere in the app.

### File: `frontend/src/context/AuthContext.jsx`

What it stores:
- `user` — the logged-in user's profile (name, email, role)
- `token` — the JWT (JSON Web Token) used to authenticate API requests

What it provides:
- `login(userData, token)` — saves user + token to `localStorage` and updates state
- `logout()` — clears everything and logs the user out
- `isAdmin` — `true` if the logged-in user has the `admin` role

The data is saved in `localStorage` so it persists when you refresh the page.

---

## 4. Protected Routes

### What it is
Some pages should only be visible to logged-in users. Some pages (like admin dashboard) should only be visible to admins. A **ProtectedRoute** is a wrapper that checks this before showing the page.

### File: `frontend/src/components/ProtectedRoute.jsx`

How it works:
- If the user is **not logged in** → redirect to `/login`
- If the page requires `role="admin"` and the user is **not an admin** → redirect to `/`
- Otherwise → show the page normally

Usage in `App.jsx`:
```jsx
<Route path="/" element={<ProtectedRoute><ElectionsPage /></ProtectedRoute>} />
<Route path="/admin/elections" element={<ProtectedRoute role="admin"><AdminElectionsPage /></ProtectedRoute>} />
```

---

## 5. API Client

### What it is
Instead of writing `axios.get('http://localhost:5001/api/elections', { headers: { Authorization: ... } })` every time, we create one shared Axios instance with the base URL and auth header pre-configured.

### File: `frontend/src/api/client.js`

What it does:
- Sets `baseURL` to `http://localhost:5001` (from `.env`)
- Automatically attaches the JWT token from `localStorage` to every request as an `Authorization: Bearer <token>` header

Every page that needs to call the backend imports this instead of raw Axios:
```js
import api from '../api/client'
api.get('/api/elections')
```

---

## 6. Pages & Components

### Navbar — `frontend/src/components/Navbar.jsx`
Shown at the top of every page (except login screens). Shows:
- App name/logo (links to home or admin dashboard depending on role)
- "Elections" nav link for voters
- "Dashboard" nav link for admins
- Logged-in user's name
- Logout button

### Voter Pages

#### Login Page — `src/pages/LoginPage.jsx`
Two-step OTP flow:
1. User enters phone number → Firebase sends an SMS OTP
2. User enters the OTP → Firebase verifies it → sends the Firebase ID token to the Flask backend → backend returns a JWT → user is logged in

#### Elections Page — `src/pages/ElectionsPage.jsx`
Shows all elections the voter is eligible for as cards. Each card shows:
- Election title and description
- Start and end times
- Status badge (Draft / Scheduled / Active / Completed)
- Visibility badge (Private / Public)

#### Election Detail Page — `src/pages/ElectionDetailPage.jsx`
Shows full info about one election:
- Election metadata
- List of candidates
- **"Verify Eligibility"** button — calls the backend to check if the voter is allowed to vote in this election. Once verified, a **"Cast Vote"** button appears.
- **"View Results"** button (shown only after election ends)

#### Vote Page — `src/pages/VotePage.jsx`
- Shows candidate cards — voter clicks one to select it
- A confirmation modal pops up asking "Are you sure?"
- On confirm, calls the backend to record the vote
- *(Smart contract integration via MetaMask will be added in TASK-012)*

#### Results Page — `src/pages/ResultsPage.jsx`
- Shows a bar chart of vote tallies for each candidate (built with plain CSS, no extra library needed)
- Highlights the winner
- Shows an audit log table of all transaction hashes and timestamps

### Admin Pages

#### Admin Login — `src/pages/AdminLoginPage.jsx`
Simple email + password form. Calls `POST /api/auth/admin/login`.

#### Admin Elections Dashboard — `src/pages/admin/AdminElectionsPage.jsx`
A table listing all elections with their status badges and a "Manage" link for each. Has a "+ New Election" button.

#### Create Election — `src/pages/admin/CreateElectionPage.jsx`
A form to create a new election with:
- Title and description
- Election type: Single Seat or Multi Seat
- Visibility: Private (ID-based eligibility) or Public (geography-based)
- Start and end date/time pickers

#### Admin Election Detail — `src/pages/admin/AdminElectionDetailPage.jsx`
Manages a single election:
- **Candidates section** — add candidates (name + party), remove them. Editing is locked once election is locked.
- **CSV voter upload** — for private elections, admin uploads a CSV file of eligible voter IDs
- **Lock & Deploy button** — transitions the election from Draft → Scheduled and triggers the Merkle tree generation + smart contract deployment jobs
- **End Election button** — manually ends an active election

---

## 7. Firebase Setup

### What Firebase is used for
Firebase Phone Authentication — voters log in by entering their phone number and receiving an SMS OTP. This avoids storing passwords.

### What was installed
```bash
npm install firebase
```

### File: `frontend/src/firebase.js`
Initializes the Firebase app using credentials from `.env`:
```js
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const app = initializeApp({ apiKey, authDomain, projectId, appId })
export const auth = getAuth(app)
```

### How the OTP login flow works
1. User enters phone number
2. Firebase creates an **invisible reCAPTCHA** (bot protection, invisible to the user)
3. `signInWithPhoneNumber(auth, phone, recaptchaVerifier)` is called — Firebase sends the SMS
4. User enters the 6-digit OTP
5. `confirmationResult.confirm(otp)` is called — Firebase verifies it and returns a **Firebase ID token**
6. The ID token is sent to `POST /api/auth/verify-otp` on the Flask backend
7. The backend verifies the token using `firebase-admin`, creates/fetches the user, and returns a **JWT**
8. The JWT is stored in `localStorage` via `AuthContext.login()` and used for all future API calls

### reCAPTCHA bug fix
There was a bug where submitting the phone form a second time (e.g. after an error) showed:

> *"reCAPTCHA has already been rendered in this element"*

**Why it happened:** The old reCAPTCHA instance wasn't properly cleaned up before creating a new one. The DOM element still had the reCAPTCHA widget rendered in it.

**Fix:** Added a `clearRecaptcha()` helper that calls `.clear()` on the existing verifier before creating a new one. This is called on every send attempt and on "Change number".

---

## 8. Environment Variables

### File: `frontend/.env`
Stores config values that change between environments (local dev vs production). Vite requires all frontend env vars to start with `VITE_`.

```
VITE_API_URL=http://localhost:5001

VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

- `VITE_API_URL` — the Flask backend URL. Used in `api/client.js` as the `baseURL`.
- The four `VITE_FIREBASE_*` values — from Firebase Console → Project Settings → Your apps → Web app config.

### File: `frontend/.env.example`
A committed template showing all required env vars with empty values. Anyone cloning the repo copies this to `.env` and fills in their own values.

### `.gitignore`
`.env` was added to `.gitignore` so the actual credentials are never committed to git.

---

## 9. Folder Structure (After Setup)

```
frontend/src/
  api/
    client.js           ← Axios instance with base URL + auth header
  components/
    Navbar.jsx          ← Top navigation bar
    ProtectedRoute.jsx  ← Redirects unauthenticated/unauthorized users
  context/
    AuthContext.jsx     ← User session state (login, logout, isAdmin)
  pages/
    LoginPage.jsx       ← Voter OTP login (Firebase)
    AdminLoginPage.jsx  ← Admin email/password login
    ElectionsPage.jsx   ← Voter elections list
    ElectionDetailPage.jsx ← Election info + eligibility check
    VotePage.jsx        ← Vote casting with confirmation modal
    ResultsPage.jsx     ← Results bar chart + audit log
    admin/
      AdminElectionsPage.jsx      ← Admin elections table
      CreateElectionPage.jsx      ← Create election form
      AdminElectionDetailPage.jsx ← Candidate mgmt, CSV upload, lock/end
  firebase.js           ← Firebase app initialization
  App.jsx               ← All route definitions
  main.jsx              ← App entry point (BrowserRouter + AuthProvider)
  index.css             ← Tailwind directives + global styles
```

---

## How to Run the Frontend

```bash
cd frontend
npm install       # install dependencies (first time only)
npm run dev       # starts dev server at http://localhost:5173
```

Make sure `.env` has all four Firebase values filled in before running.

---

## What's Coming Next

- **Web3Context + MetaMask** — connecting the wallet, signing votes on-chain (TASK-012)
- **Firebase test phone numbers** — configure in Firebase Console so you can test OTP without a real SIM
- **Backend APIs** — the pages are built and ready; they just need the Flask backend running to actually load data
