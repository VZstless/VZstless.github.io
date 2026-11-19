# Victrix's blog repo

The original README is awful so I tried to destroy it, but after all, I love apollo-typst.  

You only need `typ/posts/<post_name>/main.typ` and `content/posts/<post_name>.md` to build something here.  

The site text is set in [LXGW WenKai Screen](https://github.com/lxgw/LxgwWenKai-Screen). Both consumers of it are prepared by `yarn fetch:fonts` (which runs automatically as part of `yarn build:typ`): Typst needs the actual TTF, downloaded into the gitignored `fonts/` directory, while browsers get the unicode-range subsetted woff2 files, mirrored from [lxgwwenkai-screen-webfont](https://www.npmjs.com/package/lxgw-wenkai-screen-webfont) into the gitignored `static/webfonts/lxgw-wenkai/` so that they ship with the site and every page uses them (see `templates/partials/header.html`, family stack in `sass/main.scss`). Run `yarn fetch:fonts` once before `zola serve` if you want the web font locally too.
