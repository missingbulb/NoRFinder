# GitHub Pages

- **Writing a link, asset path or `fetch` in a page** — make it relative to the page, never
  root-relative: Pages serves the site at `https://<owner>.github.io/<repo>/`, so `/style.css`
  resolves above the site and 404s in production while working in every local preview.
  (writing-link-asset)

- **Wanting the site deployed now, or from a workflow of your own** — never add a workflow that
  publishes: the `site-release` task is the one path to production, it cuts the version and
  parks where a person must act, and a second publisher has none of that while its green run
  looks exactly like success. Force a release instead with (wanting-site-deployed)

  ```
  gh workflow run claudinite-scheduler.yml -f wake=github-pages/site-release
  ```
