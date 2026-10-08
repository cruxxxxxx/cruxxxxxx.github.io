# hypnotize.works

Astro site: the homepage (a React app of project cards) and the blog
(`/blog`), inside one persistent header/footer/moiré frame.

## Run locally

```sh
npm install
ln -sfn ~/obs/obs .blog-content   # blog posts live in the Obsidian vault repo
npm run dev                       # → http://localhost:4321
```

`astro dev` runs as a background server in Astro 7: `npx astro dev stop` to stop it.

`npm run build && npm run preview` serves the production build.

## Adding or editing a project

1. `npm run dev`, open the homepage, press **edit** (top right).
2. Pick a project, or **+ new project** (it starts with the first project's
   crop values).
3. Edit the fields. Drop images/videos onto the media list (or **+ upload…**):
   they're copied into `public/`, and images get a phone copy automatically.
   The first media item is the cover.
4. Tune the crop with the sliders while switching **closed / hover / open**:
   the real card on the page follows along.
5. **save** writes `src/data/sitedata.json` (projects) or
   `src/data/experiments.json` (experiments). Review with `git diff`, commit.

The editor only exists in `npm run dev`; the built site has none of it.

## Phone copies of media

Desktop always gets the original files. Touch screens get lighter copies when
there are some, listed in `src/data/media-variants.json`:

```sh
npm run media:mobile              # WebP copies of project images (fast)
npm run media:mobile -- --videos  # also lower-bitrate video copies (slow)
```

Video copies are gitignored for now (89 MB; hosting not decided). The build
fails if `media-variants.json` lists a copy that isn't in `public/`.

## Deploy

Pushing `master` builds and deploys with GitHub Actions
(`.github/workflows/deploy.yml`); a push to the blog repo triggers a rebuild.
See `cutover/README.md` for the switch-over from the old setup.
