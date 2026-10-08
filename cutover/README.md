# Cutover: hypnotize.works + blog as one Astro site

Everything up to here was built and tested locally on the `astro` branch.
Nothing below has been done yet. Order matters: run it top to bottom.

## Before
- Mike: real-browser pass on `npm run build && npm run preview`
  (`ln -sfn ~/obs/obs .blog-content` first): loading gate, WarioWare game,
  videos, phone tap/swipe, home ⇄ blog navigation.
- Mike: create a fine-grained token, repository access **only**
  `cruxxxxxx/cruxxxxxx.github.io`, permission **Contents: Read and write**.
  Save it in `cruxxxxxx/blog` → Settings → Secrets → Actions as
  `SITE_DISPATCH_TOKEN`.

## Steps
1. Merge `astro` → `master` and push. The new `.github/workflows/deploy.yml`
   runs, but Pages still serves the old `gh-pages` branch until step 2.
2. Main repo → Pages source: **GitHub Actions**
   (`gh api -X PUT repos/cruxxxxxx/cruxxxxxx.github.io/pages -f build_type=workflow`,
   with `GH_TOKEN="$(gh auth token --user cruxxxxxx)"`). Re-run the deploy
   workflow; check `https://hypnotize.works/`.
3. **Disable Pages on `cruxxxxxx/blog`** (Settings → Pages → unpublish). While it
   is on, that project site owns `/blog` and hides the new blog pages.
   Check `https://hypnotize.works/blog/`.
4. Replace `cruxxxxxx/blog`'s `.github/workflows/deploy.yml` with
   `cutover/blog-repo-deploy.yml` and push. Post a draft note from the phone:
   media job → `notify-site` → site rebuild → live.
5. Purge the Cloudflare cache.

## Rollback
- Main repo Pages source back to the `gh-pages` branch (the last CRA build is
  still there), and re-enable Pages on `cruxxxxxx/blog`.

## After
- Delete the blog repo's Astro app (`src/`, `astro.config.mjs`, its npm deps,
  `public/`); it becomes vault + `bin/` + workflow.
- Remove the `gh-pages` deploy scripts/dependency here, this folder, and the
  stale `gh-pages` branch once nothing needs a rollback.
