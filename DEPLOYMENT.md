# Hosting BAD IDEA

Use **DigitalOcean App Platform**, starting with one **$5/month** service. The game has a Node API that calls OpenAI, reads source files for its prompts, and can spend up to 120 seconds generating a result. Static hosting alone cannot run it. The Docker image serves the built browser game and API together, with no server administration required.

## Why this host

| Host | Fit for this repo |
| --- | --- |
| **DigitalOcean App Platform** | Runs the existing Node server. The $5 service has 512 MiB RAM and 50 GiB monthly transfer; this is a starting size to verify under load. Git pushes can deploy automatically. [Pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/), [deployment workflow](https://docs.digitalocean.com/products/app-platform/getting-started/quickstart/) |
| **Netlify** | Convenient for a browser-only game, but this API needs adaptation. Streaming functions stop after 60 seconds; 15-minute background functions cannot stream to the original request. [Function limits](https://docs.netlify.com/build/functions/api/), [background functions](https://docs.netlify.com/build/functions/background-functions/) |
| **Vercel** | Requires adapting the custom server to its function model. Hobby is for personal, noncommercial use; there is little reason to add another account for this repo. [Hobby terms](https://vercel.com/docs/plans/hobby), [function model](https://vercel.com/docs/functions) |

The $5 hosting charge excludes OpenAI API usage and transfer over the included allowance. A $10 service provides 1 GiB RAM if the smaller service needs more memory. Prices checked September 8, 2026.

## Deploy

1. Commit the reviewed hosting changes and push them to `main` in `ToukoUrsin/bad-idea`. App Platform builds that remote branch, not local uncommitted files.
2. In DigitalOcean, create an **App Platform** app and connect that GitHub repository. Grant the DigitalOcean GitHub integration access to this repository; repository owner permissions may be needed. Use `.do/app.yaml` as the app specification. It selects San Francisco, the Dockerfile, one $5 service, and automatic deploys from `main`.
3. Before creating the paid app, fill in the two blank **encrypted runtime** values: `OPENAI_API_KEY` and `GAME_PASSWORD`. Keep real values out of Git and the Docker build. `APP_ORIGIN` resolves from `${APP_URL}` to the app's public URL. [Environment variables](https://docs.digitalocean.com/products/app-platform/how-to/use-environment-variables/)
4. Review the $5 monthly resource estimate and create the app. Wait for a successful deployment, then open its generated HTTPS URL. Sign in with username **`player`** and the chosen password.
5. Check `/api/health`, load a level, and generate an invention. Check runtime logs and memory usage, including with three simultaneous generations. Use a controlled stream test lasting over 120 seconds to verify the platform connection independently of the API's own generation timeout.

The password limits access to an app backed by your paid API key. Production requires it by default. To deliberately make the game public, set runtime variable `ALLOW_PUBLIC_ACCESS=true` instead; visitors can then trigger generation using your API key.

For CLI administration, authenticate with `doctl auth init` and verify with `doctl account get`. A `401` means the saved token needs refreshing. Do not submit the template's blank secrets as a finished deployment configuration.

## Local production check

Create a local `.env.production.local` containing `OPENAI_API_KEY`, `GAME_PASSWORD`, and `APP_ORIGIN=http://localhost:8080`. This file is excluded from Git and the Docker build context. Then run:

```sh
docker build -t bad-idea .
docker run --rm --init -p 8080:8080 --env-file .env.production.local bad-idea
```

Open `http://localhost:8080` and sign in as `player`. The image uses Node 22, builds Vite once, installs only production dependencies, and runs as the unprivileged `node` user. Source files remain in the image because the API reads them for generation prompts.

## Streaming and storage

The game requests NDJSON streams over **POST** for inventions, rooms, and rule checks. The server sends an initial blank line immediately and another every 15 seconds until a result or error arrives. Older JSON-only API clients remain supported but do not receive these keepalives. DigitalOcean documents SSE over POST with default edge caching; SSE over GET requires disabling edge caching, which needs a custom domain. Validate the game's NDJSON path on the deployed URL as well. [Streaming and edge settings](https://docs.digitalocean.com/products/app-platform/how-to/configure-edge-settings/)

DigitalOcean has documented a 100-second wait for an origin response through Cloudflare. Streaming sends an initial response and periodic heartbeats, but current docs do not promise an unlimited total stream duration. Verify long streams on the deployed URL. [Timeout explanation from DigitalOcean](https://www.digitalocean.com/community/questions/app-platform-timeout-limit)

`SAVE_GENERATION_ARTIFACTS=false` disables local generation archives in production. App Platform's local filesystem is temporary and is lost on redeployment or container replacement. If persistent archives become necessary, add object storage or a database. [Storage limits](https://docs.digitalocean.com/products/app-platform/details/limits/)

`/api/health` is the platform liveness check and responds without credentials. Its `ready` field separately reports whether an API key is configured. The server listens on `0.0.0.0:8080`, matching the service's configured port. [Health checks](https://docs.digitalocean.com/products/app-platform/how-to/manage-health-checks/)
