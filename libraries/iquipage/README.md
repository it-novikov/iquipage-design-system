# @iquipage/web

Independent, source-owned Web Components library. Build with Node 24: `npm run build`; package with `npm pack`. No Sprintique imports, domain models, credentials or product build steps are permitted here.

Consumers import `@iquipage/web/core`, `/advanced`, `/whiteboard` and `/styles.css`. The core entry does not eagerly register advanced components. Tokens and types are part of the package. Source version 0.6.0-vnext.0 includes the approved compact editor, decision action, cover crop and board UX extensions. The historical 0.5.7 snapshot remains untouched elsewhere in the repository.

`products/sprintique` consumes a packed release, not this source directory. Updating the library requires rebuilding and explicitly replacing that release and lockfile. Publishing to an external registry is a separate owner-approved operation. Package remains private until distribution/licensing is settled.
