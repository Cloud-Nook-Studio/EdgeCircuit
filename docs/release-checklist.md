# Release Checklist

The repository can produce a static web build and a native Android JavaScript
bundle today. Store-ready binaries and a public web deployment still require
the owner decisions and credentials below.

## Product identity

- Confirm the public product name, subtitle, support URL, and publisher.
- Confirm or replace the provisional native identifiers:
  - iOS: `com.jonathanbate.pulsepath`
  - Android: `com.jonathanbate.pulsepath`
- Commission and add the production app icon, Android adaptive icon, splash
  treatment, store screenshots, and feature graphic.
- Keep claims consistent with `docs/product-brief.md`; do not introduce IQ,
  diagnostic, treatment, prevention, or broad-transfer language in listings.

## Native release

1. Create or select the Apple Developer and Google Play Console applications.
2. From `apps/mobile`, run `npx eas-cli init` to attach the Expo project. Review
   the generated project ID before committing the app configuration change.
3. Configure signing through the owner-controlled EAS/Apple/Google accounts.
4. Build an internal preview from the `preview` profile in `eas.json`.
5. Test on at least one current iPhone and Android phone, including:
   VoiceOver/TalkBack, reduced motion, high contrast, app background/resume,
   interrupted storage, offline startup, and compact screens.
6. Build and submit with the `production` profile only after the preview is
   approved.
7. Complete privacy nutrition labels/data-safety forms using the actual
   production SDK list. Version 0 is designed to keep training data on-device.

## Web release

1. Run `npm run check` and `npm run test:e2e`.
2. Publish `apps/web/dist` to an HTTPS static host.
3. Configure immutable caching for hashed assets and no-cache/revalidation for
   `index.html`.
4. Verify the production URL at desktop and phone sizes, keyboard-only, and
   with a screen reader.
5. Add a privacy page and support contact before collecting any account,
   analytics, or crash-reporting data.

## Release gates

- Shared tests, all TypeScript checks, web production build, and browser flows
  pass in CI.
- Expo's dependency compatibility check reports no mismatches.
- Android Metro/Hermes export succeeds.
- No high or critical dependency advisory is accepted without a written
  mitigation.
- Scoring and difficulty versions are unchanged after store screenshots and
  product copy are approved, or the changes receive a new rules version.
