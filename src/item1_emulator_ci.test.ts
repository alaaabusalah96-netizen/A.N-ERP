import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Item 1 (P0): Firestore Emulator tests exclusion & CI integration', () => {
  it('1. vite.config.ts excludes emulator tests from default suite', () => {
    const viteConfig = fs.readFileSync(path.join(process.cwd(), 'vite.config.ts'), 'utf-8');
    expect(viteConfig).toContain("'**/*_emulator.test.ts'");
    expect(viteConfig).toContain("'**/emulator_baseline.test.ts'");
  });

  it('2. package.json defines test:rules script targeting emulator tests', () => {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
    expect(pkgJson.scripts['test:rules']).toBeDefined();
    expect(pkgJson.scripts['test:rules']).toContain('firebase emulators:exec --only firestore');
    expect(pkgJson.scripts['test:rules']).toContain('src/emulator_baseline.test.ts');
    expect(pkgJson.scripts['test:rules']).toContain('src/inventory_rules_emulator.test.ts');
    expect(pkgJson.scripts['test:rules']).toContain('src/cashier_rules_emulator.test.ts');
  });

  it('3. .github/workflows/ci.yml includes Java setup and test:rules step', () => {
    const ciYaml = fs.readFileSync(path.join(process.cwd(), '.github/workflows/ci.yml'), 'utf-8');
    expect(ciYaml).toContain('Setup Java (for Firebase Emulator)');
    expect(ciYaml).toContain('actions/setup-java@v4');
    expect(ciYaml).toContain("distribution: 'temurin'");
    expect(ciYaml).toContain("java-version: '21'");
    expect(ciYaml).toContain('npm install -g firebase-tools');
    expect(ciYaml).toContain('npm run test:rules');
  });
});
