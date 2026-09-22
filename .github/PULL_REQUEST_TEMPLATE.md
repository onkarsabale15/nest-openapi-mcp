## What does this change?

<!-- A clear description of what changed and why. Link any related issue. -->

## Checklist

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all pass locally
- [ ] If this changes behavior in a published package (`packages/*/src`), a changeset is included
      (`pnpm changeset`)
- [ ] If this touches `packages/core`, the real-world regression suite
      (`packages/core/test/real-world.spec.ts`) still passes — it's the one most likely to catch a
      change that works on synthetic fixtures but breaks on a real spec
- [ ] New public exports have TSDoc comments
- [ ] Docs updated if this changes documented behavior (`README.md`, per-package README, or
      `docs/mcp-generator-hld-lld.md` if it's a design-level change)

## Anything reviewers should look at closely?

<!-- Optional: a tricky part of the change, a design trade-off you're not fully sure about, etc. -->
