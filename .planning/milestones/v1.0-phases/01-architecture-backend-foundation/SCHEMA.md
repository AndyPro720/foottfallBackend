# Phase 1: Firestore Schema Design

## Overview
This document defines the Firestore NoSQL schema for the Inventory PWA, designed cleanly to support a future CRM system without requiring complex migrations. It is designed to be easily extensible for future iterations.

## Collections

### 1. `inventory` (Root Collection)
Stores all retail units and property data. 

**Document ID**: Auto-generated or custom

**Fields**:
- `property_name` (string) - Name of the property.
- `contact` (map)
  - `name` (string)
  - `designation` (string)
  - `info` (string) - Phone/Email/Details
- `size_sqft_carpet` (number) - Size of unit (carpet area).
- `price_per_sqft_carpet` (number) - Price per sqft.
- `cam` (number) - Common Area Maintenance charges.
- `trade_area` (string) - The trade area the property falls in.
- `location` (geopoint) - Explicit Firebase GeoPoint for exact location mapping.
- `suitable_for` (array of strings) - e.g. ['F&B', 'Apparel']
- `building_details` (map)
  - `type` (string) - 'mall', 'standalone', or 'highstreet'
  - `floor` (string) - e.g. 'ground', 'first', etc.
  - `age` (number) - Age of the building in years.
  - `clear_height` (string)
  - `connected_load` (string)
  - `outside_visibility` (boolean) - Yes/No
- `facilities` (map)
  - `parking_space` (map) { `count`: number, `photo`: string/url }
  - `service_entry` (map) { `exists`: boolean, `photo`: string/url }
  - `lift_access` (map) { `exists`: boolean, `photo`: string/url }
  - `boh_space` (map) { `exists`: boolean, `photo`: string/url }
  - `fire_exit` (boolean/string)
- `documents` (map)
  - `floor_plan` (string) - URL to floor plan file.
  - `oc_file` (string) - URL to Occupancy Certificate.
- `images` (map of string arrays) - URLs pointing to Firebase Storage
  - `building_facade` (array)
  - `unit_facade` (array)
  - `interior` (array)
  - `signage` (array)
- `status` (string) - E.g. 'active', 'archived'.
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 2. `users` (Root Collection) - *Future CRM Foundation*
Stores user profiles, roles, and preferences.

**Document ID**: Firebase Auth UID

**Fields**:
- `email` (string)
- `displayName` (string)
- `role` (string) - 'admin', 'inventory_manager', 'broker'
- `created_at` (timestamp)

### 3. `transactions` (Root Collection) - *Future CRM Foundation*
Logs movements or sales of inventory directly linked to users.

**Document ID**: Auto-generated

**Fields**:
- `inventory_id` (reference) - points to `inventory/{id}`
- `user_id` (reference) - points to `users/{uid}`
- `action` (string) - 'intake', 'sale', 'move'
- `timestamp` (timestamp)

## Expected Indexes
- **Single-field indexes**: Created automatically by Firestore.
- **Composite indexes** (needed for complex geospatial or sorted queries):
  - Collection: `inventory` | Fields: `trade_area` (ASC), `created_at` (DESC)

## Basic Security Rules (Role-Based Access)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is signed in
    function isAuthenticated() {
      return request.auth != null;
    }

    match /inventory/{itemId} {
      // Anyone authenticated can read
      allow read: if isAuthenticated();
      // Only authenticated users can write (to be restricted by role later)
      allow write: if isAuthenticated(); 
    }
  }
}
```
