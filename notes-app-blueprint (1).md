# Cross-Platform Handwritten Notes App — Full Architecture & Development Blueprint

---

## Project Vision

Build a modern cross-platform handwritten notes application that works on:

- iPad with Apple Pencil
- Samsung S24 Ultra with S Pen
- Any phone or tablet (touch input)
- Desktop browsers (mouse input)

The application must:

- Support handwriting with stylus input and pressure sensitivity
- Have palm rejection
- Support notebooks and multiple pages per notebook
- Work fully offline — notes editable without internet
- Sync across devices via Google Drive (user-owned storage)
- Be installable like a native app (PWA)
- Be open source and self-hostable
- Keep user data private — even the app developers cannot read notes
- Allow users to own their own data

---

## Deployment Cost — Everything Free

Every layer of this application runs on a permanently free tier. No credit card required anywhere.

| Layer | Service | Free Tier |
|---|---|---|
| Frontend hosting | Vercel | Unlimited deployments, global CDN |
| Auth + database | Supabase | 50,000 monthly active users, 500MB DB |
| Note storage | User's Google Drive | 15GB per user, you pay nothing |
| Realtime (Phase 5) | Supabase Realtime | Included in free tier |
| Signaling (Phase 5) | Supabase Edge Functions | 500,000 invocations/month free |
| Domain | Vercel subdomain (.vercel.app) | Free forever |

Total monthly infrastructure cost to you: **$0**

This architecture scales to tens of thousands of users without ever paying a cent, because note data lives in each user's own Google Drive — you are never storing or serving it.

---

## Why PWA Instead of React Native

Build this as a **Progressive Web App (PWA)**, not a React Native app.

Reasons:

- One codebase works on all devices (iOS Safari, Android Chrome, desktop)
- Apple Pencil works natively in Safari via Pointer Events API
- S Pen works natively in Chrome/Android via Pointer Events API
- No App Store dependency
- Easier open-source contribution
- Free hosting — no server required for the app itself
- Easier updates — no store approval process
- Scales well for an open-source project

The app should feel and behave like a native app when installed to the home screen.

---

## Core Design Principles

### 1. Local-First Architecture

The app MUST always:

```
Write to local storage first → sync later
```

NEVER:

```
Wait for cloud before rendering a stroke
```

This is the most critical rule. Handwriting must feel instant. Any cloud round-trip introduced into the draw loop will make the app feel broken.

### 2. User-Owned Data

The app is NOT a storage provider. Users own their notes.

Note data must:

- Stay locally on the device (IndexedDB)
- Sync to the user's own Google Drive account
- Never be stored on the app's backend server

The backend (Supabase) is for identity only — login, user profile. It never touches note content.

### 3. Privacy-First

Notes must be encrypted locally before any cloud upload.

The encryption key must be derived from the user's password on the client side. The server never sees the key. This means:

- If a user forgets their password, their notes are unrecoverable (this is intentional and must be communicated clearly in the UI)
- Even if Google Drive is breached, notes are unreadable without the key
- Even the app developers cannot read user notes

### 4. Conflict-Free Sync

Offline editing on two devices simultaneously must not result in data loss. This is solved by using a CRDT (Conflict-free Replicated Data Type) library (Yjs) in the local storage layer. This is not optional — without it, the last-write-wins behaviour of a naive sync will silently corrupt notes.

---

## High-Level System Architecture

```
┌─────────────────────────────────────┐
│          Device Input Layer          │
│   Pointer Events API (pen/touch)    │
└───────────────┬─────────────────────┘
                │
┌───────────────▼─────────────────────┐
│           Canvas Engine              │
│  Raw Canvas 2D API + Perfect         │
│  Freehand + Transform System        │
└───────────────┬─────────────────────┘
                │
┌───────────────▼─────────────────────┐
│        Local-First Storage           │
│  IndexedDB + Yjs CRDT layer +       │
│  Sync queue (offline operations)    │
└───────────────┬─────────────────────┘
                │
┌───────────────▼─────────────────────┐
│           Sync Engine                │
│  Google Drive AppData (encrypted)   │
│  Per-page binary files              │
│  Background sync + retry            │
└───────────────┬─────────────────────┘
                │
┌───────────────▼─────────────────────┐
│     Supabase (Auth + Metadata)       │
│  Built-in Auth (JWT + Google OAuth) │
│  Postgres for user profiles only    │
│  Realtime for Phase 5 notifications │
│  Everything free, no server to run  │
└─────────────────────────────────────┘
```

---

## Full Tech Stack

| Purpose | Technology | Why This Choice |
|---|---|---|
| Frontend Framework | Next.js (App Router) | SSR, PWA support, Vercel deployment |
| Language | TypeScript | Type safety across the whole codebase |
| Styling | Tailwind CSS | Utility-first, no runtime cost |
| Rendering | Raw Canvas 2D API | Fastest for high-frequency stroke rendering |
| Stroke Smoothing | Perfect Freehand | Pressure-aware, produces smooth paths |
| Conflict Resolution | Yjs (CRDT) | Handles offline merge without data loss |
| Local Database | IndexedDB (via Dexie.js) | Offline-first, large storage, fast |
| State Management | Zustand | Minimal, no boilerplate |
| Data Fetching | TanStack Query | Caching, retries, request state |
| Auth + Backend DB | Supabase | Free tier, built-in Google OAuth, Postgres |
| Cloud Sync Storage | Google Drive AppData API | User-owned, zero storage cost for app |
| Encryption | Web Crypto API (AES-256-GCM) | Native browser, no library needed |
| Offline Support | Service Workers | Cache-first asset loading |
| PWA Support | next-pwa | Manifest + service worker generation |
| Frontend Hosting | Vercel | Free tier, global CDN, auto-deploy from GitHub |
| Realtime (Phase 5) | Supabase Realtime | Free, included in Supabase, replaces Socket.IO |

> **Why Supabase instead of a custom Express backend?**
> Supabase is a hosted Postgres + Auth service with a generous permanent free tier (50,000 monthly active users). It gives you Google OAuth, JWT management, refresh token rotation, and a database — all without running or maintaining a server. You write zero backend code for auth. It is the right choice for a free, open-source project.

> **Why Raw Canvas 2D API instead of Fabric.js?**
> Fabric.js is designed for object-selection and manipulation (think: design tools). For a handwriting app you are pushing thousands of pointer events per second. Fabric.js adds unnecessary overhead and fights you at every step. Raw Canvas 2D gives you full control. Perfect Freehand handles the stroke shape math. You only need a thin rendering layer.

---

## Frontend Architecture

### Folder Structure

```
src/
 ├── app/                    # Next.js App Router pages
 │   ├── (auth)/             # Login, signup pages
 │   ├── (app)/              # Main app pages (protected)
 │   │   ├── notebooks/      # Notebook list
 │   │   └── [notebookId]/   # Notebook view with pages
 │   ├── layout.tsx
 │   └── page.tsx
 │
 ├── canvas/                 # Everything related to drawing
 │   ├── CanvasRenderer.ts   # Raw Canvas 2D rendering logic
 │   ├── StrokeEngine.ts     # Perfect Freehand integration
 │   ├── InputHandler.ts     # Pointer Events processing
 │   ├── TransformSystem.ts  # Zoom, pan, coordinate conversion
 │   ├── LayerManager.ts     # Active layer + cached bitmap layer
 │   └── UndoRedo.ts         # Undo/redo stack
 │
 ├── storage/                # Local database
 │   ├── db.ts               # Dexie.js IndexedDB setup
 │   ├── notebooks.ts        # Notebook CRUD operations
 │   ├── pages.ts            # Page CRUD operations
 │   ├── strokes.ts          # Stroke CRUD operations
 │   └── syncQueue.ts        # Queue for pending sync operations
 │
 ├── crdt/                   # Yjs conflict resolution
 │   ├── yjsSetup.ts         # Yjs document configuration
 │   ├── strokeSync.ts       # Merge stroke operations across devices
 │   └── awareness.ts        # (Future) realtime cursor presence
 │
 ├── sync/                   # Cloud sync engine
 │   ├── SyncManager.ts      # Orchestrates sync lifecycle
 │   ├── driveClient.ts      # Google Drive API wrapper
 │   ├── encryption.ts       # AES-256-GCM encrypt/decrypt
 │   ├── fileFormat.ts       # Serialize/deserialize page data
 │   └── conflictResolver.ts # CRDT-based merge on pull
 │
 ├── auth/                   # Authentication via Supabase
 │   ├── supabaseClient.ts   # Supabase client singleton
 │   ├── AuthProvider.tsx    # React context for auth state
 │   └── googleOAuth.ts      # Trigger Google OAuth via Supabase
 │
 ├── components/             # React UI components
 │   ├── ui/                 # Generic: Button, Input, Modal
 │   ├── NotebookList.tsx
 │   ├── PageThumbnail.tsx
 │   ├── Toolbar.tsx         # Pen, eraser, color picker
 │   └── SyncStatusBadge.tsx # Sync state indicator
 │
 ├── hooks/                  # Custom React hooks
 │   ├── useCanvas.ts        # Canvas setup and teardown
 │   ├── usePointerEvents.ts # Input handling hook
 │   ├── useSync.ts          # Sync status and controls
 │   └── useNotebook.ts      # Current notebook state
 │
 ├── store/                  # Zustand state stores
 │   ├── toolStore.ts        # Current tool, pen settings
 │   ├── canvasStore.ts      # Zoom level, pan offset
 │   ├── notebookStore.ts    # Current notebook and page
 │   └── syncStore.ts        # Sync status, last synced time
 │
 ├── lib/                    # Shared utilities
 │   ├── constants.ts
 │   └── utils.ts
 │
 └── types/                  # TypeScript type definitions
     ├── stroke.ts
     ├── notebook.ts
     ├── page.ts
     └── sync.ts
```

---

## Supabase Setup — Replaces the Entire Custom Backend

Supabase handles everything the custom Express + SQLite backend was doing, for free, with zero servers to manage.

### Step 1 — Create a Free Supabase Project

1. Go to https://supabase.com and create a free account
2. Create a new project — pick any region close to your users
3. Note your project URL and anon key from Settings → API
4. Add them to your Next.js environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Step 2 — Create the Database Table

Run this SQL in the Supabase SQL editor. This is the only table you need:

```sql
-- Users table (Supabase Auth creates auth.users automatically)
-- This table stores additional profile data only
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Automatically create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Users can only read and update their own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);
```

### Step 3 — Enable Google OAuth in Supabase

1. In Supabase dashboard → Authentication → Providers → Google
2. Enable it, then copy the callback URL shown
3. Go to https://console.cloud.google.com → Create a new project
4. Enable the Google Drive API and Google OAuth consent screen
5. Create OAuth 2.0 credentials, add the Supabase callback URL
6. Copy the Client ID and Client Secret back into Supabase

This gives you Google OAuth login AND grants the Google Drive scope needed for sync — both in one flow.

### Step 4 — Supabase Client in Next.js

Install the package:

```bash
npm install @supabase/supabase-js @supabase/ssr
```

Create the client singleton:

```typescript
// auth/supabaseClient.ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

### Step 5 — Authentication Flows

Login with Google (also requests Google Drive access):

```typescript
// auth/googleOAuth.ts
import { supabase } from './supabaseClient'

export async function loginWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Request Google Drive AppData scope alongside auth
      scopes: 'https://www.googleapis.com/auth/drive.appdata',
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  })
  if (error) throw error
}

export async function logout() {
  await supabase.auth.signOut()
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Get the Google Drive access token (needed for sync)
export async function getDriveAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.provider_token ?? null  // This is the Google OAuth token
}
```

### Step 6 — Auth Provider Component

```typescript
// auth/AuthProvider.tsx
'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import type { User } from '@supabase/supabase-js'

type AuthContext = {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContext>({ user: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
```

Supabase handles JWT issuance, refresh token rotation, and session persistence automatically. You write zero custom JWT code.

---

## Canvas System — The Heart of the App

This is the most critical and performance-sensitive part of the application. Get this right before building anything else.

### Two-Layer Rendering Strategy

Do NOT redraw every stroke on every frame. Instead, use two layers:

```
┌─────────────────────────────┐
│     Active Stroke Layer      │  ← Canvas element on top
│   (current stroke only)      │  ← Cleared and redrawn every frame
└─────────────────────────────┘
┌─────────────────────────────┐
│    Cached Committed Layer    │  ← Canvas element underneath
│  (all finished strokes)      │  ← Only redrawn when necessary
└─────────────────────────────┘
```

How this works in practice:

1. While the user is drawing, only the active stroke layer is redrawn on each `requestAnimationFrame`
2. When the user lifts the stylus (`pointerup`), the finished stroke is committed to IndexedDB and drawn onto the cached layer
3. The active stroke layer is cleared
4. The cached layer is only redrawn when: the page loads, undo/redo occurs, or zoom/pan changes

This gives 60fps rendering even with thousands of strokes on a page.

### Coordinate System — Define This Before Writing Any Code

There are two coordinate spaces. Confusing them causes bugs that are expensive to fix later.

**World coordinates:** The coordinate system stored in IndexedDB. Stroke point positions are always in world coordinates. `{ x: 450.3, y: 210.7 }` means the same thing regardless of what zoom level the user is at.

**Screen coordinates:** Pixel positions on the actual canvas HTML element. These change when the user zooms or pans.

Converting between them:

```typescript
// World → Screen (for rendering)
screenX = (worldX - panOffset.x) * zoomLevel
screenY = (worldY - panOffset.y) * zoomLevel

// Screen → World (for storing pointer input)
worldX = (screenX / zoomLevel) + panOffset.x
worldY = (screenY / zoomLevel) + panOffset.y
```

Every pointer event from the user arrives in screen coordinates. Convert to world coordinates immediately in `InputHandler.ts` before storing or processing. Never store screen coordinates.

### Input Handling

Use the Pointer Events API. It works identically for Apple Pencil, S Pen, touch, and mouse.

```typescript
canvas.addEventListener('pointerdown', onPointerDown)
canvas.addEventListener('pointermove', onPointerMove)
canvas.addEventListener('pointerup', onPointerUp)

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === 'pen') {
    isPenActive = true
    canvas.setPointerCapture(event.pointerId) // Capture all events even if pointer leaves canvas
    startStroke(event)
  } else if (event.pointerType === 'touch' && !isPenActive) {
    startPanGesture(event)
  } else if (event.pointerType === 'mouse') {
    startStroke(event)
  }
}
```

Important properties to read on each event:

```typescript
event.pressure      // 0.0 to 1.0 — pen pressure
event.tiltX         // -90 to 90 — pen tilt on X axis
event.tiltY         // -90 to 90 — pen tilt on Y axis
event.pointerType   // 'pen' | 'touch' | 'mouse'
event.pointerId     // unique ID per active pointer
```

### Palm Rejection

Set on the canvas element in CSS:

```css
canvas {
  touch-action: none;
}
```

In JavaScript:

```typescript
let isPenActive = false

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === 'pen') isPenActive = true
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerType === 'pen') isPenActive = false
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerType === 'touch' && isPenActive) return // Ignore palm
  // ... rest of handler
}
```

### Stroke Data Model

Save vector stroke data, not images. This is fundamental.

```typescript
// types/stroke.ts

type Point = {
  x: number        // World coordinate
  y: number        // World coordinate
  pressure: number // 0.0 to 1.0
}

type Stroke = {
  id: string
  pageId: string
  tool: 'pen' | 'eraser' | 'highlighter'
  color: string        // e.g. '#1a1a1a'
  width: number        // Base width in world units
  points: Point[]
  createdAt: number    // Unix timestamp ms
}
```

Why vector strokes:

- Infinite zoom quality
- Much smaller storage than PNG screenshots
- Clean erasing — erase individual strokes, not pixels
- Easy sync — sync stroke additions/deletions, not whole canvases

### Perfect Freehand Integration

```typescript
import getStroke from 'perfect-freehand'

function renderStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const inputPoints = stroke.points.map(p => [p.x, p.y, p.pressure])

  const outlinePoints = getStroke(inputPoints, {
    size: stroke.width,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: false, // We have real pressure data
  })

  const path = new Path2D(getSvgPathFromStroke(outlinePoints))
  ctx.fillStyle = stroke.color
  ctx.fill(path)
}

function getSvgPathFromStroke(points: number[][]): string {
  if (!points.length) return ''
  const d = points.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
      return acc
    },
    ['M', ...points[0], 'Q']
  )
  d.push('Z')
  return d.join(' ')
}
```

---

## Local Storage — IndexedDB via Dexie.js

```typescript
// storage/db.ts
import Dexie, { Table } from 'dexie'
import type { Notebook, Page, Stroke, SyncQueueItem } from '@/types'

class NotesDatabase extends Dexie {
  notebooks!: Table<Notebook>
  pages!: Table<Page>
  strokes!: Table<Stroke>
  syncQueue!: Table<SyncQueueItem>

  constructor() {
    super('NotesAppDB')
    this.version(1).stores({
      notebooks: 'id, updatedAt',
      pages: 'id, notebookId, updatedAt',
      strokes: 'id, pageId, createdAt',
      syncQueue: '++id, pageId, status, createdAt',
    })
  }
}

export const db = new NotesDatabase()
```

```typescript
// types/sync.ts
type SyncQueueItem = {
  id?: number
  pageId: string
  operation: 'ADD_STROKE' | 'DELETE_STROKE' | 'UPDATE_PAGE' | 'DELETE_PAGE'
  payload: unknown
  status: 'pending' | 'in-progress' | 'failed'
  retries: number
  createdAt: number
}
```

---

## CRDT Layer — Yjs for Conflict Resolution

### The Problem Without CRDT

1. User edits page on iPad while offline — writes 50 new strokes
2. User edits the same page on laptop while offline — writes 30 new strokes
3. Both devices come online and sync to Google Drive
4. One device overwrites the other — 50 strokes or 30 strokes are permanently lost

### The Solution With Yjs

Yjs models your data so independent edits can always be merged. Adding strokes on two different devices can always be reconciled — both sets survive.

```typescript
// crdt/yjsSetup.ts
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

// One Y.Doc per page — persisted automatically to IndexedDB
function createPageDoc(pageId: string): Y.Doc {
  const doc = new Y.Doc()
  // Persist Yjs state to IndexedDB automatically
  new IndexeddbPersistence(`page-${pageId}`, doc)
  return doc
}

function getStrokesArray(doc: Y.Doc): Y.Array<Stroke> {
  return doc.getArray<Stroke>('strokes')
}

function addStroke(doc: Y.Doc, stroke: Stroke) {
  doc.transact(() => {
    getStrokesArray(doc).push([stroke])
  })
}

function deleteStroke(doc: Y.Doc, strokeId: string) {
  const strokes = getStrokesArray(doc)
  const index = strokes.toArray().findIndex(s => s.id === strokeId)
  if (index !== -1) {
    doc.transact(() => {
      strokes.delete(index, 1)
    })
  }
}

// Call this when a file is downloaded from Google Drive
function applyRemoteUpdate(doc: Y.Doc, update: Uint8Array) {
  Y.applyUpdate(doc, update)
  // After this call, doc contains the merged result of both devices' edits
}

// Call this to prepare data for upload to Google Drive
function encodeDocState(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc)
}
```

Install packages:

```bash
npm install yjs y-indexeddb
```

---

## Encryption System

Notes are encrypted before upload. The key is derived from the user's password. The server never sees the key or the plaintext.

### Key Derivation

```typescript
// sync/encryption.ts

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 310000,  // OWASP 2023 recommendation for PBKDF2-SHA256
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptData(data: Uint8Array, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  )
  return { ciphertext, iv }
}

async function decryptData(ciphertext: Uint8Array, iv: Uint8Array, key: CryptoKey) {
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  )
}
```

### File Format on Google Drive

Each page is one binary file. Layout:

```
[32 bytes: salt]
[12 bytes: IV]
[remaining bytes: AES-256-GCM encrypted Yjs state]
```

### Important UX Requirement

Show this message during account setup:

> "Your notes are encrypted with your password. If you forget your password, your notes cannot be recovered by anyone, including us. Please store your password somewhere safe."

Do not offer password recovery. It would require server-side key storage and break the privacy guarantee.

---

## Sync Architecture

### Google Drive AppData Folder

Use the `https://www.googleapis.com/auth/drive.appdata` scope. This creates a hidden folder in the user's Google Drive that:

- Is not visible in their Google Drive UI
- Is not accessible to other apps
- Is deleted when the user uninstalls the app
- Does not cost you anything

The Google OAuth token comes from Supabase — call `getDriveAccessToken()` from `auth/googleOAuth.ts`.

File structure inside AppData:

```
appdata/
 ├── notebooks.json         # Plain JSON — notebook titles and IDs
 └── pages/
     └── {pageId}.bin       # Encrypted Yjs state per page
```

### Google Drive API Client

```typescript
// sync/driveClient.ts

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

async function getAuthHeaders() {
  const token = await getDriveAccessToken()
  return { Authorization: `Bearer ${token}` }
}

export async function uploadPageFile(
  pageId: string,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  salt: Uint8Array
) {
  // Pack into one binary blob: [salt][iv][ciphertext]
  const blob = new Uint8Array(salt.length + iv.length + ciphertext.length)
  blob.set(salt, 0)
  blob.set(iv, salt.length)
  blob.set(ciphertext, salt.length + iv.length)

  // Check if file already exists
  const existingId = await findFileId(`pages/${pageId}.bin`)

  const metadata = {
    name: `${pageId}.bin`,
    parents: existingId ? undefined : ['appDataFolder'],
  }

  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', new Blob([blob], { type: 'application/octet-stream' }))

  const url = existingId
    ? `${DRIVE_UPLOAD_API}/files/${existingId}?uploadType=multipart`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart`

  await fetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: await getAuthHeaders(),
    body: form,
  })
}

export async function downloadPageFile(pageId: string): Promise<{
  ciphertext: Uint8Array
  iv: Uint8Array
  salt: Uint8Array
} | null> {
  const fileId = await findFileId(`${pageId}.bin`)
  if (!fileId) return null

  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: await getAuthHeaders(),
  })
  const buffer = new Uint8Array(await res.arrayBuffer())

  // Unpack: [32 salt][12 iv][rest ciphertext]
  const salt = buffer.slice(0, 32)
  const iv = buffer.slice(32, 44)
  const ciphertext = buffer.slice(44)
  return { salt, iv, ciphertext }
}

async function findFileId(name: string): Promise<string | null> {
  const res = await fetch(
    `${DRIVE_API}/files?spaces=appDataFolder&q=name='${name}'&fields=files(id)`,
    { headers: await getAuthHeaders() }
  )
  const data = await res.json()
  return data.files?.[0]?.id ?? null
}
```

### SyncManager

```typescript
// sync/SyncManager.ts

export class SyncManager {
  private isSyncing = false
  private encryptionKey: CryptoKey | null = null

  async initialize(password: string) {
    // Derive the encryption key from the user's password once at login
    // Store in memory only — never persisted anywhere
    const salt = await this.getUserSalt() // Stored in user's Drive as a separate tiny file
    this.encryptionKey = await deriveKey(password, salt)
  }

  start() {
    // Process queue on start, then every 15 seconds
    this.processSyncQueue()
    setInterval(() => this.processSyncQueue(), 15_000)
  }

  async processSyncQueue() {
    if (this.isSyncing || !this.encryptionKey) return
    this.isSyncing = true

    try {
      const pending = await db.syncQueue
        .where('status').equals('pending')
        .toArray()

      for (const item of pending) {
        await this.syncItem(item)
      }
    } finally {
      this.isSyncing = false
    }
  }

  async syncItem(item: SyncQueueItem) {
    await db.syncQueue.update(item.id!, { status: 'in-progress' })

    try {
      const doc = getPageDoc(item.pageId)
      const stateBytes = encodeDocState(doc)
      const salt = crypto.getRandomValues(new Uint8Array(32))
      const { ciphertext, iv } = await encryptData(stateBytes, this.encryptionKey!)
      await uploadPageFile(item.pageId, ciphertext, iv, salt)
      await db.syncQueue.delete(item.id!)
    } catch {
      const retries = item.retries + 1
      await db.syncQueue.update(item.id!, {
        status: retries > 5 ? 'failed' : 'pending',
        retries,
      })
    }
  }

  async pullPage(pageId: string) {
    if (!this.encryptionKey) return

    const file = await downloadPageFile(pageId)
    if (!file) return

    const plaintext = await decryptData(file.ciphertext, file.iv, this.encryptionKey)
    const doc = getPageDoc(pageId)
    applyRemoteUpdate(doc, plaintext) // Yjs merges local + remote — no data loss
  }
}
```

---

## Supabase Realtime — Replaces Socket.IO (Phase 5)

Instead of running a separate Socket.IO signaling server, use Supabase Realtime (included free).

When Device A finishes uploading to Google Drive, it broadcasts a small message via Supabase Realtime. Device B receives it and pulls the updated page immediately. Updates appear in 1-2 seconds.

```typescript
// sync/realtimeSync.ts
import { supabase } from '@/auth/supabaseClient'

export function subscribeToPageUpdates(
  userId: string,
  onUpdate: (pageId: string) => void
) {
  return supabase
    .channel(`user-${userId}-updates`)
    .on('broadcast', { event: 'page_updated' }, (payload) => {
      onUpdate(payload.payload.pageId)
    })
    .subscribe()
}

export async function broadcastPageUpdate(userId: string, pageId: string) {
  await supabase
    .channel(`user-${userId}-updates`)
    .send({
      type: 'broadcast',
      event: 'page_updated',
      payload: { pageId },
    })
}
```

Call `broadcastPageUpdate` after every successful Drive upload. On other devices, the subscription calls `syncManager.pullPage(pageId)` immediately.

No server required. No Socket.IO server to deploy. All free.

---

## State Management (Zustand)

```typescript
// store/toolStore.ts
import { create } from 'zustand'

type ToolStore = {
  activeTool: 'pen' | 'eraser' | 'highlighter' | 'select'
  penColor: string
  penWidth: number
  eraserWidth: number
  setTool: (tool: ToolStore['activeTool']) => void
  setPenColor: (color: string) => void
  setPenWidth: (width: number) => void
}

export const useToolStore = create<ToolStore>((set) => ({
  activeTool: 'pen',
  penColor: '#1a1a1a',
  penWidth: 4,
  eraserWidth: 20,
  setTool: (tool) => set({ activeTool: tool }),
  setPenColor: (color) => set({ penColor: color }),
  setPenWidth: (width) => set({ penWidth: width }),
}))

// store/canvasStore.ts
type CanvasStore = {
  zoomLevel: number
  panOffset: { x: number; y: number }
  setZoom: (zoom: number) => void
  setPan: (offset: { x: number; y: number }) => void
}

export const useCanvasStore = create<CanvasStore>((set) => ({
  zoomLevel: 1.0,
  panOffset: { x: 0, y: 0 },
  setZoom: (zoomLevel) => set({ zoomLevel }),
  setPan: (panOffset) => set({ panOffset }),
}))

// store/syncStore.ts
type SyncStore = {
  status: 'idle' | 'syncing' | 'error' | 'offline'
  lastSyncedAt: number | null
  pendingCount: number
  setStatus: (status: SyncStore['status']) => void
  setPendingCount: (count: number) => void
}

export const useSyncStore = create<SyncStore>((set) => ({
  status: 'idle',
  lastSyncedAt: null,
  pendingCount: 0,
  setStatus: (status) => set({ status }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
}))
```

---

## PWA Configuration

### next-pwa setup

Install:

```bash
npm install next-pwa
```

```javascript
// next.config.js
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})

module.exports = withPWA({
  // your Next.js config
})
```

### public/manifest.json

```json
{
  "name": "Notes — Private Handwriting App",
  "short_name": "Notes",
  "description": "Encrypted handwriting notes that sync across devices via your Google Drive",
  "display": "standalone",
  "orientation": "any",
  "start_url": "/",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "/icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

---

## Performance Requirements

Handwriting must feel instantaneous. If it does not, nothing else matters.

Target: strokes render within one frame (16ms at 60fps, 8ms at 120fps for ProMotion screens).

Rules:

- Never call any async function inside `pointermove`. Collect points synchronously. Write to IndexedDB only after `pointerup`.
- Never trigger a React re-render during a stroke. Canvas rendering must be entirely outside React's render cycle.
- Use `requestAnimationFrame`, never `setTimeout`, for the render loop.
- Use `canvas.setPointerCapture(event.pointerId)` on `pointerdown` so events continue to arrive even if the pointer leaves the canvas element.
- Batch IndexedDB writes — write the full stroke on `pointerup`, not point by point.

```typescript
// CORRECT — async never enters the draw loop
const currentPoints: Point[] = []

function onPointerMove(event: PointerEvent) {
  currentPoints.push({
    x: toWorldX(event.clientX),
    y: toWorldY(event.clientY),
    pressure: event.pressure,
  })
  scheduleRender() // requestAnimationFrame — synchronous
}

function onPointerUp() {
  const stroke = buildStroke(currentPoints)
  currentPoints.length = 0
  commitStroke(stroke) // async — IndexedDB + sync queue
}
```

---

## Development Roadmap

### Phase 1 — Canvas (2-3 weeks)

Goal: Smooth handwriting on iPad and S24 Ultra. Nothing else.

Build:

- Next.js project with TypeScript and Tailwind
- Two-layer canvas (active + cached)
- Pointer Events input handler with palm rejection
- Perfect Freehand stroke rendering
- Coordinate transform system (world ↔ screen)
- Pen tool and eraser tool
- Pressure sensitivity
- Undo/redo (in-memory only)

Done when: Writing with Apple Pencil and S Pen feels smooth and pressure-responsive at 60fps.

---

### Phase 2 — Local Storage (2-3 weeks)

Goal: Notes survive app restart. Full offline capability.

Build:

- Dexie.js IndexedDB setup with full schema
- Notebook CRUD (create, list, rename, delete)
- Page CRUD (add pages, navigate between pages)
- Stroke persistence to IndexedDB on `pointerup`
- Yjs document setup — one Y.Doc per page, persisted via y-indexeddb
- Autosave indicator in UI
- Load page strokes from IndexedDB on page open
- Undo/redo backed by Yjs (replaces in-memory undo from Phase 1)

Done when: Notes survive browser refresh. Notebooks and pages work. Undo/redo works.

---

### Phase 3 — Authentication (1 week)

Goal: Cross-device user identity. Uses Supabase — no custom backend code.

Build:

- Create Supabase project and run the SQL schema above
- Install @supabase/supabase-js in Next.js
- Enable Google OAuth in Supabase dashboard (5 minutes)
- AuthProvider component and useAuth hook
- Login page with "Continue with Google" button
- Protected routes using Next.js middleware
- Callback route handler at /auth/callback

Done when: A user can log in with Google and stay logged in across browser restarts.

---

### Phase 4 — Cloud Sync (2-3 weeks)

Goal: Notes accessible on multiple devices. Data survives device loss.

Build:

- Google Drive API client (driveClient.ts) using the token from Supabase OAuth
- Encryption system (PBKDF2 key derivation, AES-256-GCM)
- SyncManager with 15-second polling
- Sync queue in IndexedDB with retry and exponential backoff
- Pull on app launch (sync down before showing notes)
- SyncStatusBadge component showing sync state
- Conflict resolution via Yjs on pull

Done when: Edit on iPad, open on laptop, see the same notes within 15 seconds.

---

### Phase 5 — Realtime Sync (1 week)

Goal: Updates appear instantly across devices.

Build:

- Supabase Realtime channel subscription (no new server needed)
- Broadcast `page_updated` event after each successful Drive upload
- On receiving event, call `syncManager.pullPage(pageId)` immediately
- Graceful fallback to 15-second polling when offline or disconnected

Done when: Edit on iPad, see it on the laptop within 1-2 seconds.

---

### Phase 6 — Advanced Features (ongoing)

Add after Phase 5 is stable:

- Lasso selection tool
- Shape recognition
- PDF export (jsPDF or pdf-lib)
- PDF import (background layer)
- Handwriting recognition (Tesseract.js)
- Search inside handwriting
- Collaborative editing (Yjs already supports it — add WebRTC transport)
- Infinite canvas

Do not build any of these before Phase 4 sync is solid and tested on real devices.

---

## MVP Definition

Ship to users only when these are working:

- Smooth handwriting with Apple Pencil and S Pen
- Palm rejection
- Pen tool and eraser tool
- Notebook and page system
- Works fully offline
- Autosave
- Cross-device sync via Google Drive (15-second polling)
- Installable as PWA
- Google login via Supabase

Do NOT include in v1:

- Realtime collaboration
- OCR or handwriting recognition
- AI features
- PDF import/export
- Infinite canvas

---

## Deployment — Step by Step (All Free)

### Step 1 — Supabase (5 minutes)

1. Create account at https://supabase.com
2. Create project
3. Run the SQL schema from the Supabase Setup section above
4. Enable Google OAuth provider, add Client ID and Secret from Google Cloud Console
5. Copy project URL and anon key to environment variables

### Step 2 — Google Cloud Console (15 minutes)

1. Create project at https://console.cloud.google.com
2. Enable APIs: Google Drive API, Google+ API
3. Configure OAuth consent screen (External, add your email as test user during development)
4. Create OAuth 2.0 Client ID (Web application type)
5. Add Supabase callback URL to Authorized redirect URIs
6. Copy Client ID and Secret to Supabase Google provider settings

### Step 3 — Vercel (2 minutes)

1. Push code to GitHub
2. Go to https://vercel.com, connect GitHub repo
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy — Vercel auto-deploys on every push to main

Your app is live at `your-project.vercel.app` for free. Custom domain is also free on Vercel.

### Environment Variables Needed

```env
# .env.local (development)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# No other environment variables needed
# Google OAuth credentials live in Supabase dashboard, not in your app
```

---

## Security Checklist (Before Launch)

Supabase handles most of this automatically, but verify:

- [ ] HTTPS everywhere (Vercel provides this for free)
- [ ] Supabase Row Level Security enabled on profiles table (SQL above includes this)
- [ ] JWT tokens managed by Supabase (automatic — you do not write token code)
- [ ] Refresh token rotation enabled in Supabase Auth settings
- [ ] Google OAuth scopes limited to drive.appdata only — not full Drive access
- [ ] Encryption key never leaves the client
- [ ] Salt and IV are unique per file upload
- [ ] PBKDF2 iterations at 310,000 (OWASP 2023 guidance)
- [ ] Password-lost warning shown clearly in onboarding

---

## Open Source Strategy

- MIT license
- Modular architecture — contributors can work on canvas, sync, or auth independently
- No backend to maintain — Supabase is the backend, contributors do not need to run a server
- Document the encryption format so data is portable — users can decrypt their Drive files independently
- docker-compose not needed because there is no custom server to run

---

## Core Philosophy Summary

1. **Local-first** — write locally, sync later, always
2. **User-owned data** — Google Drive is the user's, not ours
3. **Privacy-first** — encrypt before upload, key never leaves device
4. **Conflict-free** — Yjs CRDT handles offline merge correctly
5. **Cross-platform** — one PWA codebase for all devices
6. **Zero backend cost** — Supabase free tier, Vercel free tier, user's own Drive
7. **Smooth handwriting** — 60fps rendering is non-negotiable
8. **Offline-capable** — full functionality without internet
9. **Open-source friendly** — no server to run, just clone and deploy
10. **Phased delivery** — ship the canvas first, sync later, collaboration last
