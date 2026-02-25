# CET Test Series Platform

A full-stack assessment platform for CET-style preparation with role-based workflows for **Admin**, **Teacher**, **Coordinator**, and **Student**.

The system supports:
- Multi-role authentication and approval
- Subject-wise and mock/custom test creation
- Coordinator test composition from teacher question banks
- Admin approval and publishing flow
- Student test-taking, evaluation, rankings, and result visibility controls
- Study material management

---

## Tech Stack

- Frontend: React + TypeScript + Vite
- Styling: Tailwind CSS
- Backend: Vercel Serverless Functions (`api/*.ts`)
- Database: MongoDB + Mongoose
- Auth: JWT + bcrypt

---

## Project Structure

```text
api/
  auth.ts
  courses.ts
  materials.ts
  subjects.ts
  tests.ts
  users.ts
  _db.ts

src/
  QuizPlatform.tsx
  api.ts
  types.ts
  views/
    LoginView.tsx
    AdminView.tsx
    TeacherView.tsx
    CoordinatorView.tsx
    StudentView.tsx
    TakingTestView.tsx
```

---

## Role Workflows

### Admin
- Approve/reject teachers and coordinators
- Approve/reject tests submitted for review
- Create courses, create subjects, assign teachers to subjects
- Manage users and monitor analytics/rankings

### Teacher
- Create question banks/tests by assigned subjects
- Toggle test active status and answer-key visibility
- Upload and manage materials

### Coordinator
- Select a course
- Pull unapproved teacher question banks
- Compose final tests and submit for admin approval

### Student
- Attempt approved + active tests for assigned course
- View scores and section-wise performance
- Access materials for assigned course
- See answer keys only when enabled by teacher/admin

---

## API Surface (Current)

Only these functional API endpoints are used:

- `POST /api/auth`
- `GET /api/auth?action=me`
- `GET, POST /api/courses`
- `GET, POST, PUT, DELETE /api/subjects`
  - Question bank query mode: `GET /api/subjects?action=questions&courseId=<id>`
- `GET, POST, PATCH, DELETE /api/tests`
  - Item/action mode via query:
    - `testId=<id>`
    - `action=approve` (PATCH)
- `GET, POST, PATCH, DELETE /api/materials`
  - Item mode via query: `materialId=<id>`
- `GET, POST, PATCH, DELETE /api/users`
  - Attempts mode via query: `action=attempts`
  - User mode via query: `userId=<id>`
  - Approve mode: `action=approve`

`api/_db.ts` is an internal shared module (not a route).

---

## Environment Variables

Create a `.env` file with:

```env
MONGODB_URI=mongodb://localhost:27017/quizplatform
JWT_SECRET=replace-with-a-strong-random-secret
VITE_API_URL=/api
```

Notes:
- `MONGODB_URI` and `JWT_SECRET` are required in production.
- `VITE_API_URL` can stay `/api` for Vercel-style deployments.

---

## Local Development

### 1) Install dependencies

```bash
npm install
```

### 2) Run frontend

```bash
npm run dev
```

### 3) Run API locally (recommended with Vercel runtime)

```bash
npx vercel dev
```

If you only run Vite, frontend starts but API routes are not served unless your environment provides them.

---

## Build & Quality

```bash
npm run build
npm run lint
```

Type checks used during validation:

```bash
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.node.json --noEmit
```

---

## Deployment

This repository is structured for Vercel serverless deployment:
- Frontend build output: `dist`
- API routes: `api/*.ts`

Ensure production environment variables are set before deploy.

---

## Security Notes

- Change default seeded admin credentials immediately in production.
- Never commit `.env` or secrets.
- Use a strong `JWT_SECRET`.
- Restrict CORS origin in production if needed.

---

## License

Private/internal project unless explicitly licensed otherwise.
