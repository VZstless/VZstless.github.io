#import "@preview/typst-apollo:0.1.0": pages
#import "@preview/shiroa:0.2.3": target
#import pages: *

#show: project.with(
  title: "friends",
)

#set par(justify: true)

// Theme colors (mirrors packages/typst-apollo/theme.typ)
#let theme-target = if target.contains("-") { target.split("-").at(1) } else { "light" }
#let theme-style = toml("../../packages/typst-apollo/theme-style.toml").at(theme-target)
#let main-color = rgb(theme-style.at("main-color"))
#let dash-color = rgb(theme-style.at("dash-color"))

// Friends data. Avatars are downloaded from `avatar` URLs by the build
// script (scripts/build-posts.js) and listed in avatars.json.
#let friends = toml("friends.toml").friend
#let avatars = json("avatars.json")

// Fallback avatar for friends without a (reachable) avatar image.
#let placeholder(name) = box(
  width: 60pt,
  height: 60pt,
  align(
    center + horizon,
    circle(
      radius: 27pt,
      fill: main-color.transparentize(92%),
      stroke: 1pt + main-color.transparentize(70%),
      align(center + horizon, text(size: 20pt, weight: 600, name.slice(0, 1))),
    ),
  ),
)

// A friend card: avatar on the left, name + description on the right.
// The card is a `grid.cell` whose border is drawn as a rounded rect via
// `place`: the cell spans the full row height, so cards in the same row
// are always aligned; `place` lets us use `radius`, which grid.cell lacks.
#let card(avatar-path, friend) = grid.cell(
  breakable: false,

  [
    // rounded border overlaying the cell (doesn't affect flow layout)
    #place(
      top + left,
      rect(width: 100%, height: 100%, radius: 4pt, stroke: 1pt + main-color),
    )
    #pad(
      10pt,
      grid(
        columns: (60pt, 1fr),
        gutter: 10pt,

        if avatar-path != none {
          image(avatar-path, width: 60pt, height: 60pt)
        } else {
          placeholder(friend.name)
        },

        [
          #link(friend.url)[*#friend.name*]
          #v(2pt)
          #friend.description
        ],
      ),
    )
  ],
)

== If you want to put your blog link here, contact me through social media!

#grid(
  columns: (1fr, 1fr),
  gutter: 10pt,

  ..friends.enumerate().map(((i, f)) => card(avatars.at(i, default: none), f)),
)