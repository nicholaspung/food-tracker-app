# GitHub workflows

Mobile app automation is disabled. The four `mobile-*.yml.disabled` files retain
their original definitions, but GitHub Actions only loads `.yml` and `.yaml`
workflow files. They cannot run on pushes, pull requests, or manual dispatch.
To restore a mobile workflow, remove its `.disabled` suffix and commit the change.

The active workflows are:

- `deploy.yml`: deploys the websites and backend to Beta on qualifying pushes to
  `main`. Production deployment remains manual.
- `backend-security.yml`: runs backend tests and vulnerability scanning when
  backend files or its workflow change, on pull requests and pushes to `main`.
- `action-reference-policy.yml`: checks deployment security when workflow,
  action, or deployment-policy files change, on pull requests and pushes to `main`.

The app website is built from `apps/mobile`, so changes to its shared source must
remain eligible for website deployment. Native-only iOS/Android directories and
EAS build configuration are excluded from the automatic deployment trigger.
Mobile app code and local development/build commands are preserved.
