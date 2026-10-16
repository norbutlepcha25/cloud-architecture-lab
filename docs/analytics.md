# Website and lab usage analytics

The static app integrates with Umami Cloud (or your own Umami server). Umami stores
visits and events and supplies the private analytics dashboard; this repository is
not an analytics database. No live collection starts until configured and deployed.

## Activate

1. Create a website in Umami, using your production domain. Copy its website ID and
   tracker script URL from the dashboard's tracking code. Keep dashboard credentials
   and API keys out of the frontend; the website ID is public.
2. Copy `.env.example` to `.env.local` and fill all three `VITE_UMAMI_*` values.
   Domains must be exact hostnames, e.g. `example.com,www.example.com`, not URLs.
3. Build and deploy: `npm run build`. Vite embeds these settings at **build time**.
   A running nginx container does not read changed analytics environment variables.
   For Docker Compose, supply the same variables through `.env` or your shell and run
   `docker compose up --build`. For the verification workflow's build artifacts, set
   repository Actions variables with those same names. These are not secrets.
4. Visit the production domain and check your Umami dashboard. Open a lab and run a
   simulation; verify `lab_opened` and `simulation_run` appear. Locally, `npm run dev`
   never sends analytics. Browser blocking/preferences can prevent collection.

Tracker script must use HTTPS. Tracking is disabled if configuration is incomplete,
the hostname is not allowed, Do Not Track/GPC is enabled, or `umami.disabled` is set.
The footer's **Stop tracking** sets that opt-out for this browser. To re-enable later,
remove `umami.disabled` from browser local storage and reload.

## Reports and event definitions

Use Umami's overview for visitors, visits, referrers, devices and country/region/city
breakdowns. Locations are approximate IP-derived locations, not GPS; VPNs and shared
networks affect attribution. Visitor counts are estimates, not identified individuals.

| Event | Meaning / properties |
| --- | --- |
| `screen_view` | Home or lab screen opened (`page`); these are events, not extra pageviews |
| `mode_opened` | Design, Simulate, Failure, Analyze, Compare or Challenges mode |
| `lab_opened` | Loaded lab reference (`lab_id`) |
| `reference_opened` | Loaded reference (`reference_id`) |
| `simulation_run` | Simulation invoked, with boolean `success`; includes Run from Labs |
| `configuration_checked` | Lab configuration assertions evaluated, with boolean `success` |
| `challenge_opened` | Built-in challenge selected (`challenge_id`) |
| `challenge_evaluated` | Evaluation performed, with boolean `passed` |
| `diagram_saved` | Successful JSON file export (`format`: draft, reference or lab) |
| `active_time` | Incremental active seconds, with current screen/mode/lab/reference context |

Track pageviews once using Umami's default tracker. Home/lab uses hashes; the separate
`screen_view` event distinguishes these screens without duplicating pageviews.
Built-in IDs can identify individual examples. Custom references/labs use `custom`;
names, paths entered in the simulator, graph data, filenames and configuration are
not analytics properties. No persistent user ID or session replay is enabled.
Query strings and hashes are excluded from tracker pageview URLs.

Active time counts only a visible tab and stops 60 seconds after the last pointer,
keyboard, wheel or touch interaction. It sends **increments**, normally every 30
seconds and at visibility/context changes/page exit. It is an engagement estimate:
reading without interaction beyond the cutoff is excluded, and network failures or
closing a browser can lose the last increment. It measures active browser time,
not verified learning time or unique-person attendance.

For utilization, filter events by lab/reference ID, mode and location. Count
`simulation_run` and `diagram_saved`; separate `passed`/`success` values to review
outcomes. Sum the numeric `seconds` property on `active_time` events (divide by 60
for minutes), using an event-data report/export supported by your Umami installation.
Do not interpret the count of `active_time` events as minutes, or Umami's normal visit
duration as active time. Use totals by country/region and a weekly date range for a
location utilization report. Dashboard/API access stays private, outside this SPA.

## Verification and limits

`test/analytics.test.ts` tests inactive/hidden intervals, property filtering,
production/domain gating, startup queue, opt-out and tracker failures. The tracker
has a bounded startup queue and catches synchronous/asynchronous failures. No events
are persisted locally for retries. A blocked analytics server cannot block editing.

References: [tracker configuration](https://docs.umami.is/docs/tracker-configuration),
[tracker functions](https://docs.umami.is/docs/tracker-functions),
[event data](https://docs.umami.is/docs/event-data),
[metric definitions](https://docs.umami.is/docs/metric-definitions).
