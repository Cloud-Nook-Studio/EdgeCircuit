# Security Notes

## Dependency advisory snapshot — July 25, 2026

`npm audit` reports ten moderate advisories and no high or critical advisories.
All ten roll up through Expo's native build/configuration toolchain. The
underlying concrete advisory is `uuid` below 11.1.1, reached through:

```text
expo 57.0.8
  @expo/config-plugins 57.0.6
    xcode 3.0.1
      uuid 7.0.3
```

The affected UUID buffer API is part of iOS project-generation tooling; it is
not shipped as Cognivate gameplay code in the web or Android JavaScript
bundles. npm currently labels the only automated resolution as replacing Expo
57 with Expo 46.0.21. That is an incompatible downgrade and was not applied.
Forcing UUID 11 across Expo's pinned dependency boundary was also avoided
without upstream compatibility evidence.

Mitigation:

- do not run Expo prebuild/configuration against untrusted project input;
- keep the lockfile committed and use `npm ci` in CI;
- monitor Expo SDK 57 patch releases for an upstream `xcode`/`uuid` update;
- rerun `npm audit` before preview and production native builds; and
- stop a release for any high or critical advisory until it is fixed or
  explicitly assessed.

This note is a point-in-time engineering assessment, not a claim that the app
has undergone a formal security audit.
