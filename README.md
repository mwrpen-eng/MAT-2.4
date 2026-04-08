# MOWI Air Tool

Local React + Vite app backed by the REST/SQLite server in `server/`.

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the API server:
   ```bash
   npm run api
   ```
3. In a second terminal, start the frontend:
   ```bash
   npm run dev
   ```
4. Open `http://127.0.0.1:5173`

## Environment

Create `.env.local` with:

```env
VITE_APP_API_PROVIDER=rest
VITE_APP_API_BASE_URL=http://127.0.0.1:3001/api
```

## Data

- SQLite database: `server/data/app.db`
- JSON backup import/export: `/migration`

## Quick demo deploy

The app is now set up to run as **one service**: the Node server serves both the built React frontend and the `/api` endpoints.

### Fastest stable path: Render

1. Push this repo to GitHub.
2. In Render, click **New +** → **Blueprint** and connect the repo.
3. Render will pick up the included `render.yaml` and create the Node web service.
4. Click **Apply** to create the web service and persistent disk.
5. After deploy finishes, open the Render URL and share it.

The default hosted demo config is:

```env
NODE_ENV=production
HOST=0.0.0.0
DATA_DIR=/var/data
AUTH_MODE=local
```

> `starter` is recommended here because SQLite needs persistent disk storage for stable hosted data.
>
> For a real internal rollout, switch `AUTH_MODE=entra` and add the Azure variables below.

## Microsoft Entra ID setup

For MOWI internal sign-in, register:

1. **SPA app registration** for the React frontend
2. **API app registration** for the backend (`access_as_user` scope)
3. Restrict access with **MOWI Entra groups** and/or the `mowi.com` domain
4. Publish the app internally behind **Zscaler Private Access**

Frontend example (`.env.local`):

```env
VITE_AUTH_MODE=entra
VITE_ENTRA_TENANT_ID=<tenant-id>
VITE_ENTRA_CLIENT_ID=<spa-client-id>
VITE_ENTRA_API_SCOPE=api://<api-client-id>/access_as_user
VITE_ENTRA_REDIRECT_URI=https://your-internal-app-url
VITE_ENTRA_POST_LOGOUT_REDIRECT_URI=https://your-internal-app-url
```

Backend example (server environment):

```env
AUTH_MODE=entra
AZURE_TENANT_ID=<tenant-id>
AZURE_CLIENT_ID=<api-client-id>
AZURE_ALLOWED_EMAIL_DOMAINS=mowi.com
AZURE_ALLOWED_GROUPS=<group-object-id-1>,<group-object-id-2>
APP_ALLOWED_ORIGIN=https://your-internal-app-url
HOST=0.0.0.0
PORT=3001
```

> `AUTH_MODE=local` remains available for offline/local development.

