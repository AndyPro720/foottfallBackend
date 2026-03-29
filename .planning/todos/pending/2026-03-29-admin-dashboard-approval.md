---
created: "2026-03-29T13:15:00.000Z"
title: Admin Dashboard for account management and user approval
area: auth
files:
  - src/backend/userRoleService.js
  - src/pages/Login.js
  - firestore.rules
---

## Problem

Currently, any user can sign up and become an 'agent' immediately. The user wants to restrict account creation or require an approval step to manage roles and access.

## Solution

1. **User Status**: Add a `status` field to user profiles in the `/users` collection (default: `pending`).
2. **Admin Dashboard**: Create a restricted page at `#admin` reachable only by users with the `admin` role.
3. **User Management**: The admin dashboard should list all users and allow toggling their status (`active`, `pending`, `suspended`) and role (`agent`, `admin`).
4. **Approval Gate**:
    - Update `src/main.js` to show a "Your account is pending approval" screen for authenticated users with `pending` status.
    - Update `firestore.rules` to only allow mutations (CRUD) if the requester's user profile is `active`.
5. **UI**: Add an "Admin" link to the user profile dropdown for administrators.
