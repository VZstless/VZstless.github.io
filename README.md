# Victrix's blog repo

The original README is awful so I tried to destroy it, but after all, I love apollo-typst.  

You only need `typ/posts/<post_name>/main.typ` and `content/posts/<post_name>.md` to build something here.  

The site text is set in [LXGW WenKai Screen](https://github.com/lxgw/LxgwWenKai-Screen): browsers get it from the CDN (see `templates/partials/header.html`, family stack in `sass/main.scss`), while Typst needs the actual TTF, which `yarn fetch:fonts` downloads into the gitignored `fonts/` directory (it runs automatically as part of `yarn build:typ`).
