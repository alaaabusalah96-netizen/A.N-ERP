# CustodyFlow Testing Framework & Guidelines (TEST-01)

This project utilizes [Vitest](https://vitest.dev/) as its main testing framework for lightweight, fast, and automated regression guards.

## Running Tests

To run the automated test suite once:
```bash
npm run test
```

To run tests in watch mode during development:
```bash
npx vitest
```

## Testing Rules & Guidelines

1. **Mandatory Regression Guards**: Any bug fix or logical correction made to core business modules (e.g., calculations, validations, data access modules, authorization levels) **MUST** be accompanied by a corresponding unit test inside `src/stabilization.test.ts` (or a dedicated `.test.ts` file).
2. **Success & Failure Scenarios**: Tests must cover both happy-path scenarios (success) and edge cases/validation failures (failure) to ensure graceful error handling.
3. **No Database Side Effects**: Since our runtime utilizes Firebase Firestore, you should mock external cloud services using Vitest's `vi.mock()` to run tests completely in-memory without network side-effects.
4. **Local Storage Mocking**: Ensure the mock version of `localStorage` is injected into `global` before executing any test that relies on cached state or the `StorageEngine`.

## Monitored Modules
- **Validation Engine** (`src/db/validation.ts`)
- **Transactions Management** (`src/db/transactions.*.ts`)
- **Users and Authorization** (`src/db/users.ts`)
- **Security & Password Hashing** (`src/lib/hash.ts`)
