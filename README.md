# PawMatch — Local Pet Care & Adoption Matchmaker

A web demo of the Local Pet Care & Adoption Matchmaker course project:
connects adopters, pet owners, shelters, vets, and service providers with
intelligent matchmaking, an adoption workflow, pet healthcare, and lost & found.

The app runs in two modes:

- **Live mode** (Supabase configured): account registration uses real email
  verification codes, and conversations, chat messages, and notifications
  sync across devices via Supabase Realtime.
- **Local mode** (no Supabase): the same flows run against built-in seed
  data and `localStorage`.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Copy the Supabase project URL + anon key into `.env.local` (see `supabase/` for the schema).
3. Start the dev server: `npm run dev`
4. Build for production: `npm run build`
