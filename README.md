# HERE Art Backend

Railway backend for the HERE art discovery app.

## What this backend does

- Provides health checks at `/healthz`
- Provides artwork routes at `/api/artworks` and `/artworks`
- Provides artist routes at `/api/artists` and `/artists`
- Uses PostgreSQL when `DATABASE_URL` is set
- Creates the required `artworks` and `artists` tables automatically
- Allows the Netlify frontend at `https://herefavoured.netlify.app`

## Railway settings

Railway should run:

```bash
npm install
npm start
```

Required environment variables:

```bash
DATABASE_URL=<Railway Postgres connection string>
FRONTEND_URL=https://herefavoured.netlify.app
NODE_ENV=production
```

Railway provides `PORT` automatically. Do not hard-code the port.

## Main routes

```bash
GET /healthz
GET /api/artworks
POST /api/artworks
GET /api/artworks/:id
GET /api/artists
POST /api/artists
```

## Frontend connection

The Netlify frontend should use:

```bash
REACT_APP_API_URL=https://backend-production-036e.up.railway.app
```

## Notes

This backend is designed to be safe for early production use. Image upload storage should eventually move to object storage such as S3, Cloudinary, Firebase Storage, or Supabase Storage. For now, the frontend accepts image URLs so the app can be used without blocking launch.
