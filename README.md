# LCC Mileage Tracker

A small web app for logging business mileage and entering it into the Oracle Fusion **Mileage Personal Contribution** form. It's built for one Lancashire County Council employee's own claims. It isn't an official LCC system.

Live at **https://miles.6nyn5.com**. Only named people can sign in (see [Security](#security)).

## What it does

- **Log trips:** date, journey type, start and stops, return journey, passengers, reason. The fields match the Oracle form: Journey Date, Journey Type, Reason For Journey, Route Details, Miles, No of Passengers.
- **Work out miles:** addresses are found with Ordnance Survey's OS Places API, and the driving distance comes from OpenRouteService. Each trip has a "Check in Google Maps" link for comparison.
- **Estimate the claim** at HMRC approved rates (45p, then 25p after 10,000 miles in a tax year). These are estimates only. Oracle calculates the actual payment.
- **Help Oracle entry:** a bookmarklet ("Fill Oracle Mileage") types one logged trip into the open Oracle form. The person checks the fields and presses Continue and Submit themselves. **It never submits anything, and it has no access to Oracle beyond the page the user already has open.**
- **Reports:** printable summaries by month or tax year, plus CSV export.

## Domains to allow

For the app to work on a council network, these need to be reachable:

| Domain | Used for |
| --- | --- |
| `miles.6nyn5.com` | The app itself |
| `old-bonus-9557.cloudflareaccess.com` | Sign-in page (Cloudflare Access) |
| `api.os.uk` | Address search (Ordnance Survey OS Places) |
| `api.openrouteservice.org` | Driving distance, plus fallback address search |
| `api.postcodes.io` | Postcode lookup, used as a fallback |
| `fonts.googleapis.com`, `fonts.gstatic.com` | Web font. Optional: the app falls back to system fonts |

The "Check in Google Maps" link opens `www.google.com/maps` only when it's clicked.

## Data

| Data | Where it's kept |
| --- | --- |
| Trips (dates, addresses, reasons, miles) and settings (vehicle registration, vehicle type, saved places, rates) | Cloudflare Workers KV, so they're the same on every device. Each browser also keeps a copy (`localStorage`), so the app works offline and syncs when it's back online. All signed-in users share one log, the claimant's. Users can also download a JSON backup or a CSV. |
| Address text as it's typed | Sent to OS Places and, as a fallback, OpenRouteService and postcodes.io to find matches |
| Route coordinates | Sent to OpenRouteService to calculate the distance |
| Oracle credentials and data | Never seen, stored or sent. The bookmarklet runs inside the user's own Oracle tab, and trip details pass to it through the user's clipboard. |

## Security

- **Sign-in:** the whole site, including its API, is behind **Cloudflare Access**. Only an allow-list of named email addresses can reach it, and they sign in with a one-time emailed code.
- **Sync API:** `/api/trips` and `/api/settings` verify the Cloudflare Access login token itself (RS256 signature, audience, issuer and expiry) before reading or writing anything. It doesn't trust headers alone.
- **No bypass routes:** the Worker's `workers.dev` address and preview URLs are switched off, so the Access-protected hostname is the only way in.
- **API keys:** the OS Places and OpenRouteService browser keys are embedded in the page. They're only exposed to signed-in users.

## Files

| File | Purpose |
| --- | --- |
| `mileage-tracker.html` | The whole app: one HTML file, no build step or dependencies. Works opened locally too, without sync. |
| `apple-touch-icon.png` | Home-screen icon |
| `Mileage Tracker - How To.mp4` | Walkthrough video, also shown in the app's Help tab |
| `deploy/worker.js` | Cloudflare Worker: serves the files and the `/api/trips` and `/api/settings` sync endpoints |
| `deploy/wrangler.jsonc` | Worker configuration |
| `deploy/deploy.sh` | Publishes the app (`wrangler deploy`) |

## Deploying

```sh
deploy/deploy.sh
```

This needs Wrangler logged in to the Cloudflare account. People are allowed or removed in the Cloudflare Zero Trust dashboard, under the "Mileage Tracker" Access application.
