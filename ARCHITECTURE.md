# CET Quiz Platform - Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     CET QUIZ PLATFORM                           │
│                  Distributed Upload Model                       │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   ADMIN      │  │   TEACHER    │  │ COORDINATOR  │  │   STUDENT    │
│   (Admin)    │  │  (Teacher)   │  │(Coordinator) │  │  (Student)   │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │                 │
       │                 │                 │                 │
       └────────┬────────┴────────┬────────┴────────┬────────┘
                │                 │                 │
                ▼                 ▼                 ▼
        ┌───────────────────────────────────────────────┐
        │         FRONTEND COMPONENTS                   │
        ├───────────────────────────────────────────────┤
        │ • AdminView          (subjects, users, tests) │
        │ • TeacherView        (upload questions)       │
        │ • CoordinatorView    (compose tests)          │
        │ • StudentView        (take tests)             │
        │ • TakingTestView     (test interface)         │
        │ • LoginView          (authentication)         │
        └──────────┬──────────────────────────────────┬─┘
                   │                                  │
                   ▼ HTTP Requests                    ▼ Token
        ┌──────────────────────────────────────────────────┐
        │          VERCEL SERVERLESS FUNCTIONS            │
        │              (6 CORE ENDPOINTS)                  │
        ├──────────────────────────────────────────────────┤
        │ 1. auth.ts           POST /api/auth              │
        │    - Login/Register  GET  /api/auth/me           │
        │                                                  │
        │ 2. courses.ts        GET  /api/courses           │
        │ - CRUD operations    POST /api/courses           │
        │                                                  │
        │ 3. subjects.ts       GET  /api/subjects          │
        │ - Subject management POST /api/subjects          │
        │ - Questions preview  GET  /api/subjects/questions│
        │                      PUT  /api/subjects          │
        │                                                  │
        │ 4. tests.ts          GET  /api/tests             │
        │ - Test CRUD          POST /api/tests             │
        │ - Approval workflow  PATCH /api/tests/:id        │
        │                      PATCH /api/tests/:id/approve│
        │                                                  │
        │ 5. materials.ts      GET  /api/materials         │
        │ - Study materials    POST /api/materials         │
        │                      DELETE /api/materials/:id   │
        │                                                  │
        │ 6. users.ts          GET  /api/users/attempts    │
        │ - User management    POST /api/users/attempts    │
        │ - Submissions        GET  /api/users             │
        │ - Approvals          PATCH /api/users/:id/approve│
        │                                                  │
        └──────────────────────┬──────────────────────────┘
                               │
                    ▼ URL Multiplexing
        ┌──────────────────────────────────────────────────┐
        │     DATABASE UTILITY & SCHEMAS                   │
        │            (_db.ts)                              │
        ├──────────────────────────────────────────────────┤
        │ • connectDB()        - MongoDB connection        │
        │ • Subject schema     - Subject model             │
        │ • User schema        - Updated with role+subs    │
        │ • Course schema      - Updated with subjects[]   │
        │ • Test schema        - Updated with coordinatorId│
        │ • Question schema    - Questions within tests    │
        │ • TestSubmission     - Student submissions       │
        │ • Material schema    - Study materials           │
        └──────────────────────┬──────────────────────────┘
                               │
                               ▼
        ┌──────────────────────────────────────────────────┐
        │          MONGODB DATABASE                        │
        │         (Single Instance)                        │
        ├──────────────────────────────────────────────────┤
        │ Collections:                                     │
        │ • users          - Teachers, Coordinators, etc  │
        │ • courses        - Course definitions           │
        │ • subjects       - Subject-to-teacher mapping   │
        │ • tests          - Test compositions            │
        │ • testsubmissions- Student submissions          │
        │ • materials      - Study materials              │
        └──────────────────────────────────────────────────┘
```

## Data Flow - Question Upload to Student Test

```
┌──────────────────────────────────────────────────────────────┐
│   PHASE 1: TEACHER UPLOADS QUESTIONS                         │
│   (Distributed by subject = ~1-2MB each)                     │
└──────────────────────────────────────────────────────────────┘

  TEACHER LOGIN
       │
       ▼
  IS SUBJECT ASSIGNED? ──N──► SHOW WARNING
       │                       "No subjects assigned"
       Y
       │
       ▼
  SELECT ASSIGNED SUBJECT(S)
       │ (e.g., only Physics assigned)
       │
       ▼
  UPLOAD QUESTIONS (Physics only)
       │ ~1-2MB per subject
       │
       ▼
  DATABASE: Store in Subject.questions[]
       │
       ▼
  UPLOAD COMPLETE ✓


┌──────────────────────────────────────────────────────────────┐
│   PHASE 2: COORDINATOR COMPOSES TEST                         │
│   (Combines multiple teachers' questions)                    │
└──────────────────────────────────────────────────────────────┘

  COORDINATOR LOGIN
       │
       ▼
  SELECT COURSE
       │
       ▼
  VIEW TEACHER QUESTION BANKS
       │ Fetch all questions for subjects in course
       │
       ├─► Physics questions (from Teacher A)
       ├─► Chemistry questions (from Teacher B)
       ├─► Mathematics questions (from Teacher C)
       └─► Biology questions (from Teacher D)
       │
       ▼
  SELECT SPECIFIC QUESTIONS
       │ Multi-select from displayed questions
       │
       ▼
  CONFIGURE TEST
       │ Set title, timing, answer key visibility
       │
       ▼
  SUBMIT FOR APPROVAL
       │
       ▼
  DATABASE: Create Test with coordinatorId


┌──────────────────────────────────────────────────────────────┐
│   PHASE 3: ADMIN APPROVAL                                    │
└──────────────────────────────────────────────────────────────┘

  ADMIN SEES PENDING TESTS
       │
       ├─► From Coordinators (unapproved)
       └─► Can preview content
       │
       ▼
  APPROVE ──► Set approved=true, showAnswerKey
       │
       ▼
  DATABASE: Test marked approved


┌──────────────────────────────────────────────────────────────┐
│   PHASE 4: STUDENT TAKES TEST                                │
└──────────────────────────────────────────────────────────────┘

  STUDENT LOGIN
       │
       ▼
  VIEW AVAILABLE TESTS
       │ (approved tests only)
       │
       ├─► Physics + Chemistry + Maths (full mock)
       ├─► Physics only (subject test)
       └─► Mixed subjects (coordinator composition)
       │
       ▼
  START TEST
       │ Load questions from Test.sections[]
       │
       ▼
  ANSWER QUESTIONS
       │
       ▼
  SUBMIT TEST
       │ Calculate score vs maxScore
       │
       ▼
  DATABASE: Create TestSubmission record
       │
       ▼
  VIEW RESULTS ✓
       │ Score, percentage, comparison to others
       │
       ▼
  CHECK RANKINGS
```

## File Upload Size Comparison

### BEFORE (Upload All at Once)
```
Physics:    ~1.5 MB
Chemistry:  ~1.5 MB
Maths:      ~1.5 MB
Biology:    ~1.0 MB
────────────────────
Total:      ~5.5 MB ❌ EXCEEDS 4.5MB LIMIT
```

### AFTER (Distributed Upload)
```
Teacher 1 uploads Physics:    ~1.5 MB ✓ (33% of limit)
Teacher 2 uploads Chemistry:  ~1.5 MB ✓ (33% of limit)
Teacher 3 uploads Maths:      ~1.5 MB ✓ (33% of limit)
Teacher 4 uploads Biology:    ~1.0 MB ✓ (22% of limit)
```

Result: **Each upload safely under limit, parallel uploads possible**

## Role-Based Permissions Matrix

```
┌────────────────────────────────────────────────────────────┐
│           FEATURE              │ Teacher │ Coordinator │ Admin │
├────────────────────────────────────────────────────────────┤
│ Upload questions               │    ✓    │      ✗      │   ✓   │
│ Upload for assigned subjects   │    ✓    │      ✗      │   ✗   │
│ View own test submissions      │    ✓    │      ✗      │   ✗   │
│ Create tests                   │    ✓    │      ✓      │   ✓   │
│ View question banks (others)   │    ✗    │      ✓      │   ✓   │
│ Compose tests (subjects)       │    ✗    │      ✓      │   ✗   │
│ Approve tests                  │    ✗    │      ✗      │   ✓   │
│ Manage subjects                │    ✗    │      ✗      │   ✓   │
│ Assign teachers to subjects    │    ✗    │      ✗      │   ✓   │
│ View all users                 │    ✗    │      ✗      │   ✓   │
│ View all submissions           │    ✗    │      ✗      │   ✓   │
│ Approve teachers/coordinators  │    ✗    │      ✗      │   ✓   │
└────────────────────────────────────────────────────────────┘
```

## Subject-Teacher Assignment Flow

```
┌──────────────────────────────────────────────────────────┐
│   ADMIN CREATES SUBJECT-TEACHER MAPPING                  │
└──────────────────────────────────────────────────────────┘

  Admin Panel → Subjects Tab
       │
       ├─► Create Subject Dialog
       │   Select: Course → Subject Name
       │
       ├─► Select Course: "NEET 2024"
       │   Select Subject: "Physics"
       │   Click "Create Subject" ✓
       │
       └─► Now: Subject.Physics exists in database
           (NEET 2024 → Physics)

  Admin Panel → Assign Teachers
       │
       ├─► Select Subject: "NEET 2024 - Physics"
       │   Select Teacher: "Prof. Smith (Teacher ID: 123)"
       │   Click "Assign Teacher" ✓
       │
       └─► Now: Subject.teacherId = Prof. Smith
           User.assignedSubjects[] = [Physics]

  Result:
  - Prof. Smith can ONLY upload questions for Physics
  - TeacherView shows only Physics in subject selection
  - Other subjects appear grayed out "Not assigned"
  - Presets (PCM, PCB, All) are disabled if missing required subjects
```

## API Consolidation Route Parsing

```
Request comes in: "PATCH /api/tests/123abc/approve"

Inside tests.ts handler:
┌────────────────────────────────────────┐
│ Step 1: Split URL path                 │
│ urlParts = ["api", "tests", "123abc",  │
│            "approve"]                  │
└────────────────────────────────────────┘
              ▼
┌────────────────────────────────────────┐
│ Step 2: Extract ID and action          │
│ itemId = urlParts[2]  = "123abc"       │
│ action = urlParts[3]  = "approve"      │
└────────────────────────────────────────┘
              ▼
┌────────────────────────────────────────┐
│ Step 3: Route to handler               │
│ if (action === "approve") {            │
│   // Handle approval logic             │
│   // Admin approves test               │
│   // Set approved=true                 │
│ }                                      │
└────────────────────────────────────────┘

Without consolidation: Would need separate file
  - /api/tests/[id]/approve.ts

With consolidation: Single file handles all
  - /api/tests.ts (handles all test operations)
```

## Vercel Function Allocation

```
BEFORE CONSOLIDATION (13+ files):
─────────────────────────────────
  api/auth.ts                   ✓
  api/auth/me.ts                ✓
  api/courses.ts                ✓
  api/tests.ts                  ✓
  api/tests/[id].ts             ✓
  api/tests/[id]/approve.ts     ✓
  api/materials.ts              ✓
  api/materials/[id].ts         ✓
  api/subjects.ts               ✓
  api/subjects/questions.ts     ✓
  api/users.ts                  ✓
  api/users/[id].ts             ✓
  api/users/[id]/approve.ts     ✓
  api/attempts.ts               ✓
─────────────────────────────────
  Total: 14 functions ❌ EXCEEDS LIMIT (12)


AFTER CONSOLIDATION (6 functions):
─────────────────────────────────
  api/auth.ts                   ✓ (login, register, /me)
  api/courses.ts                ✓
  api/tests.ts                  ✓ (all test operations)
  api/materials.ts              ✓ (all material operations)
  api/subjects.ts               ✓ (subjects + questions)
  api/users.ts                  ✓ (users, attempts, approvals)
  api/_db.ts                    (utility, not counted)
─────────────────────────────────
  Total: 6 functions ✓ WITHIN LIMIT (12)
```

---

**System designed to scale:** Each teacher uploads independently, coordinators combine seamlessly, all within Vercel constraints.
