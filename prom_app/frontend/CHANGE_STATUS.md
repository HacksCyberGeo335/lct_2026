# Снимок изменений перед коммитами · 27.09.2026

Исторический снимок до оформления коммитов: индекс обеих веток был пуст, HEAD — e22ae82.
Актуальную историю смотрите через `git log`, состояние — через `git status`.

## main

```text
 M prom_app/frontend/.env.example
 M prom_app/frontend/README.md
 D prom_app/frontend/public/inspection/README.md
 D prom_app/frontend/public/inspection/foundation-ok.png
 D prom_app/frontend/public/inspection/foundation-ok.png.json
 D prom_app/frontend/public/inspection/manifest.json
 D prom_app/frontend/public/inspection/pit-missing.png
 D prom_app/frontend/public/inspection/pit-missing.png.json
 D prom_app/frontend/public/inspection/pit-ok.png
 D prom_app/frontend/public/inspection/pit-ok.png.json
 D prom_app/frontend/public/inspection/pit-unexpected.png
 D prom_app/frontend/public/inspection/pit-unexpected.png.json
 D prom_app/frontend/public/media/README.md
 D prom_app/frontend/public/media/ice-center-1.webm
 D prom_app/frontend/public/media/kindergarten-214-1.webm
 D prom_app/frontend/public/media/north-park-1.webm
 D prom_app/frontend/public/media/north-park-2.webm
 D prom_app/frontend/public/media/north-park-3.webm
 D prom_app/frontend/public/media/river-quarter-1.webm
 D prom_app/frontend/public/media/river-quarter-2.webm
 D prom_app/frontend/public/media/school-1517-1.webm
 M prom_app/frontend/src/App.tsx
 M prom_app/frontend/src/api/assetLoaders.test.ts
 D prom_app/frontend/src/api/demoStorage.test.ts
 D prom_app/frontend/src/api/demoStorage.ts
 D prom_app/frontend/src/api/inspectionDemo.ts
 M prom_app/frontend/src/api/source.ts
 D prom_app/frontend/src/demo/data.ts
 D prom_app/frontend/src/demo/observations.ts
 D prom_app/frontend/src/demo/reference.ts
 M prom_app/frontend/src/domain/catalog.test.ts
 D prom_app/frontend/src/domain/domain.test.ts
 M prom_app/frontend/src/domain/inspection.test.ts
 M prom_app/frontend/src/features/catalog/FrameWorkspace.tsx
 D prom_app/frontend/src/features/import/PlanRecovery.tsx
 D prom_app/frontend/src/features/player/Player.tsx
 D prom_app/frontend/src/features/player/Scene.tsx
 D prom_app/frontend/src/pages/Analytics.tsx
 M prom_app/frontend/src/pages/ApiWorkspace.tsx
 M prom_app/frontend/src/pages/CatalogInspection.tsx
 M prom_app/frontend/src/pages/Inspection.tsx
 D prom_app/frontend/src/pages/LegacyInspection.tsx
 D prom_app/frontend/src/pages/Objects.tsx
 D prom_app/frontend/src/pages/Schedule.tsx
 D prom_app/frontend/src/pages/Settings.tsx
 D prom_app/frontend/src/pages/Site.tsx
 M prom_app/frontend/src/shared/config.ts
 D prom_app/frontend/tests/app.spec.ts
 D prom_app/frontend/tests/catalog.spec.ts
 M prom_app/frontend/tests/fixtures/README.md
 D prom_app/frontend/tests/frontend-review.spec.ts
 D prom_app/frontend/tests/inspection.spec.ts
 D prom_app/frontend/tests/regressions.spec.ts
 D prom_app/frontend/tools/generate-demo-media.mjs
 D prom_app/frontend/tools/generate-inspection-demo.mjs
 M prom_app/frontend/tools/verify-preview.mjs
 M prom_app/frontend/tools/verify-production.mjs
 M prom_app/frontend/vite.config.ts
?? prom_app/frontend/CHANGE_STATUS.md
?? prom_app/frontend/INTEGRATION_REPORT.md
?? prom_app/frontend/src/app/demoExtension.ts
?? prom_app/frontend/src/shared/config.test.ts
?? prom_app/frontend/tests/fixtures/inspection/README.md
?? prom_app/frontend/tests/fixtures/inspection/foundation-ok.png
?? prom_app/frontend/tests/fixtures/inspection/foundation-ok.png.json
?? prom_app/frontend/tests/fixtures/inspection/manifest.json
?? prom_app/frontend/tests/fixtures/inspection/pit-missing.png
?? prom_app/frontend/tests/fixtures/inspection/pit-missing.png.json
?? prom_app/frontend/tests/fixtures/inspection/pit-ok.png
?? prom_app/frontend/tests/fixtures/inspection/pit-ok.png.json
?? prom_app/frontend/tests/fixtures/inspection/pit-unexpected.png
?? prom_app/frontend/tests/fixtures/inspection/pit-unexpected.png.json
?? prom_app/frontend/tests/upload-api.spec.ts
?? prom_app/frontend/tests/working.spec.ts
?? prom_app/frontend/tools/verify-live.mjs
```

## demo

```text
 M prom_app/frontend/.env.example
 M prom_app/frontend/README.md
 M prom_app/frontend/src/App.tsx
 M prom_app/frontend/src/api/assetLoaders.test.ts
 M prom_app/frontend/src/api/source.ts
 M prom_app/frontend/src/domain/catalog.test.ts
 M prom_app/frontend/src/domain/inspection.test.ts
 M prom_app/frontend/src/features/catalog/FrameWorkspace.tsx
 M prom_app/frontend/src/pages/ApiWorkspace.tsx
 M prom_app/frontend/src/pages/CatalogInspection.tsx
 M prom_app/frontend/src/pages/Inspection.tsx
 M prom_app/frontend/src/shared/config.ts
 M prom_app/frontend/src/vite-env.d.ts
 M prom_app/frontend/tests/app.spec.ts
 M prom_app/frontend/tests/fixtures/README.md
 M prom_app/frontend/tools/verify-preview.mjs
 M prom_app/frontend/tools/verify-production.mjs
 M prom_app/frontend/vite.config.ts
?? prom_app/frontend/CHANGE_STATUS.md
?? prom_app/frontend/INTEGRATION_REPORT.md
?? prom_app/frontend/src/app/demoExtension.ts
?? prom_app/frontend/src/demo/entry.ts
?? prom_app/frontend/src/demo/source.ts
?? prom_app/frontend/src/shared/config.test.ts
?? prom_app/frontend/tests/fixtures/inspection/README.md
?? prom_app/frontend/tests/fixtures/inspection/foundation-ok.png
?? prom_app/frontend/tests/fixtures/inspection/foundation-ok.png.json
?? prom_app/frontend/tests/fixtures/inspection/manifest.json
?? prom_app/frontend/tests/fixtures/inspection/pit-missing.png
?? prom_app/frontend/tests/fixtures/inspection/pit-missing.png.json
?? prom_app/frontend/tests/fixtures/inspection/pit-ok.png
?? prom_app/frontend/tests/fixtures/inspection/pit-ok.png.json
?? prom_app/frontend/tests/fixtures/inspection/pit-unexpected.png
?? prom_app/frontend/tests/fixtures/inspection/pit-unexpected.png.json
?? prom_app/frontend/tests/upload-api.spec.ts
?? prom_app/frontend/tests/working.spec.ts
?? prom_app/frontend/tools/verify-live.mjs
```

