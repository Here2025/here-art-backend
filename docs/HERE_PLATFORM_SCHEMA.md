# HERE Platform Data Model

This document defines the next backend foundation for HERE as a discovery platform for street art, public creativity, local artists, creative events, and journeys.

The live frontend should not depend on all of these tables immediately. The first goal is to prepare the backend cleanly without disturbing the current working app.

## Core content types

### artworks

Existing table. Represents murals, street art, public installations, gallery moments, and other visual art locations.

Recommended future fields:

- id
- title
- artist
- creator_id
- description
- address
- city
- state
- country
- neighborhood
- image_url
- latitude
- longitude
- category
- tags
- status
- submitted_by
- created_at
- updated_at

### profiles

Represents all people or organizations that can exist in HERE.

Profile types:

- explorer
- street_artist
- visual_artist
- musician
- performer
- gallery
- collective
- event_host
- admin

Recommended fields:

- id
- display_name
- handle
- profile_type
- bio
- city
- state
- country
- website
- instagram
- image_url
- is_verified
- created_at
- updated_at

### creative_events

Represents time-based creative events.

Examples:

- live local music
- gallery opening
- art walk
- pop-up exhibition
- poetry night
- performance
- mural unveiling

Recommended fields:

- id
- title
- host_profile_id
- description
- event_type
- venue_name
- address
- city
- state
- country
- latitude
- longitude
- starts_at
- ends_at
- image_url
- ticket_url
- price_label
- status
- created_at
- updated_at

### journeys

Curated art trails or discovery collections.

Examples:

- Downtown Raleigh murals
- Hidden gems near me
- Creative events this weekend
- Black artists to discover
- Date night art walk

Recommended fields:

- id
- title
- description
- city
- state
- country
- image_url
- curator_profile_id
- status
- created_at
- updated_at

### journey_items

Connects journeys to artworks and events.

Recommended fields:

- id
- journey_id
- item_type: artwork or event
- item_id
- sort_order
- note
- created_at

### interactions

Tracks user activity and engagement.

Interaction types:

- save
- like
- check_in
- follow

Recommended fields:

- id
- profile_id
- target_type: artwork, event, profile, journey
- target_id
- interaction_type
- created_at

### submissions

Optional future moderation table if submissions need a review queue separate from published content.

Recommended fields:

- id
- submitter_profile_id
- submission_type
- payload_json
- status
- reviewer_profile_id
- review_note
- created_at
- updated_at

## API route direction

Near-term routes:

- GET /api/artworks
- POST /api/artworks
- GET /api/profiles
- POST /api/profiles
- GET /api/events
- POST /api/events
- GET /api/journeys
- POST /api/journeys
- POST /api/interactions
- GET /api/me/saved

## Build sequence

1. Keep the current artwork routes stable.
2. Add profiles and events tables.
3. Add read-only event routes.
4. Add discovery feed endpoint that combines artworks and events.
5. Add interactions after user auth is planned.
6. Add moderation/admin approval.
